import { brandMentioned } from "./text-match";
import { classifyDomain, classifyUrlType } from "./geo-engine";
import type { GeoRunResult } from "@/types";

/**
 * GEO aksiyon planı (AI'sız): "Neden anılmıyorum ve ne yapmalıyım?"
 * Kaybedilen cevaplarda AI'ın hangi kaynaklara dayandığına bakar ve işi türüne göre gruplar:
 * cevap sayfası yaz · listelere/haberlere gir · topluluklarda görün · rakip sayfasına karşılık ver ·
 * kendi sayfanda markayı netleştir · ansiklopedik varlık · algıyı düzelt.
 */

export interface BrandRef {
  name: string;
  domain: string;
  aliases?: string[];
}
export type ActionType = "write" | "listicle" | "community" | "counter" | "own-page" | "entity" | "sentiment";
export interface GeoAction {
  id: string;
  type: ActionType;
  title: string;
  why: string;
  steps: string[];
  /** Etkilenen (kaybedilen) cevap sayısı. */
  impact: number;
  effort: "Kolay" | "Orta" | "Zor";
  prompts: string[];
  evidence: { label: string; url?: string; note?: string }[];
  competitors: string[];
}

export const ACTION_LABEL: Record<ActionType, string> = {
  write: "Cevap sayfası yaz",
  listicle: "Listelere ve haberlere gir",
  community: "Topluluklarda görün",
  counter: "Rakip sayfasına karşılık ver",
  "own-page": "Kendi sayfanı güçlendir",
  entity: "Bilgi kaynağında yer al",
  sentiment: "Algıyı düzelt",
};

const clean = (d: string) => d.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();

export function buildActionPlan(runs: GeoRunResult[], own: BrandRef, competitors: BrandRef[]): GeoAction[] {
  const ownD = clean(own.domain);
  const compDomains = competitors.map((c) => clean(c.domain));
  const compsIn = (r: GeoRunResult) => competitors.filter((c) => brandMentioned(r.responseText, { name: c.name })).map((c) => c.name);
  // Kaybedilen cevap: marka anılmamış (markalı sorular hariç — onlarda anılmamak ayrı bir sorundur).
  const lost = runs.filter((r) => !r.mentioned && !r.branded);
  const out: GeoAction[] = [];

  // 1) Cevap sayfası: kimse ya da rakip kazanıyor, bizim sitemiz hiç kaynak gösterilmemiş.
  const byPrompt = new Map<string, GeoRunResult[]>();
  for (const r of lost) byPrompt.set(r.promptText, [...(byPrompt.get(r.promptText) ?? []), r]);
  // Kaybedilen cevapların en az yarısında sitemiz hiç kaynak gösterilmemişse o soruya cevap veren güçlü bir sayfamız yok demektir.
  const writeP = [...byPrompt.entries()]
    .map(([p, rs]) => ({ p, rs: rs.filter((r) => !r.citations.some((c) => clean(c.domain) === ownD)), all: rs }))
    .filter((w) => w.rs.length && w.rs.length >= w.all.length / 2)
    .map(({ p, rs }) => ({ p, rs, comps: [...new Set(rs.flatMap(compsIn))] }))
    .sort((a, b) => b.rs.length + b.comps.length - (a.rs.length + a.comps.length));
  if (writeP.length) {
    out.push({
      id: "write",
      type: "write",
      title: `${writeP.length} soruya doğrudan cevap veren sayfan yok`,
      why: `Bu sorularda AI motorları senin sitenden hiçbir sayfayı kaynak göstermiyor${writeP.some((w) => w.comps.length) ? `; ${[...new Set(writeP.flatMap((w) => w.comps))].slice(0, 3).join(", ")} anılıyor` : ""}. Soruyu ilk paragrafta cevaplayan bir sayfa, alıntılanmanın ön koşulu.`,
      steps: [
        "Her soru için ayrı bir yazı ya da mevcut bir sayfaya ayrı bir bölüm aç; başlık soruyla aynı ifadeyi kullansın.",
        "İlk 2–3 cümlede soruyu net cevapla, sonra ayrıntı, tablo ve SSS ver.",
        "Yayınladıktan 1–2 hafta sonra GEO testini tekrar çalıştır ve görünürlüğü karşılaştır.",
      ],
      impact: writeP.reduce((s, w) => s + w.rs.length, 0),
      effort: "Orta",
      prompts: writeP.map((w) => w.p).slice(0, 12),
      evidence: writeP.slice(0, 8).map((w) => ({ label: w.p, note: w.comps.length ? `Anılan: ${w.comps.join(", ")}` : "Hiçbir marka anılmıyor" })),
      competitors: [...new Set(writeP.flatMap((w) => w.comps))],
    });
  }

  // Kaynak URL'leri (kaybedilen cevaplarda) türüne göre
  const urls = new Map<string, { url: string; domain: string; type: string; urlType: string; prompts: Set<string>; comps: Set<string>; n: number }>();
  for (const r of lost) {
    const cs = compsIn(r);
    for (const c of r.citations) {
      const d = clean(c.domain || c.url);
      if (!d || d === ownD) continue;
      const type = classifyDomain(d, ownD, compDomains);
      const e = urls.get(c.url) ?? { url: c.url, domain: d, type, urlType: classifyUrlType(c.url, type), prompts: new Set<string>(), comps: new Set<string>(), n: 0 };
      e.prompts.add(r.promptText);
      cs.forEach((x) => e.comps.add(x));
      e.n++;
      urls.set(c.url, e);
    }
  }
  const all = [...urls.values()].sort((a, b) => b.comps.size * 2 + b.n - (a.comps.size * 2 + a.n));

  // 2) Listeler / haberler / karşılaştırma siteleri: rakipleri anan üçüncü taraf sayfalar.
  // Rakip listesi tanımlı değilse rakip anılmasını şart koşma (yine de üçüncü taraf kaynakları göster).
  const third = all.filter((u) => (u.type === "Editorial" || u.type === "Corporate" || u.type === "Other") && (u.comps.size > 0 || !competitors.length));
  if (third.length) {
    out.push({
      id: "listicle",
      type: "listicle",
      title: competitors.length ? `${third.length} üçüncü taraf sayfa rakiplerini öneriyor, seni değil` : `Kaybettiğin cevaplar ${third.length} üçüncü taraf sayfaya dayanıyor`,
      why: "AI motorları \"en iyi …\" listelerini, karşılaştırma ve haber sayfalarını sık kaynak gösterir. Bu sayfalarda adının geçmesi, cevapta adının geçmesinin en kısa yolu.",
      steps: [
        "Listeden en çok sorunun dayandığı 3–5 sayfayı seç; yazarını ya da editörünü bul.",
        "Kısa, kişisel bir e-posta yaz: listeye neden uyduğunu somut bir farkla anlat (fiyat, hizmet bölgesi, uzmanlık, veri).",
        "Ücretli yerleşim ya da link satın alma önerme; editoryal güncellemeyi iste. Backlinkler sayfasındaki e-posta taslağını kullanabilirsin.",
      ],
      impact: third.reduce((s, u) => s + u.n, 0),
      effort: "Orta",
      prompts: [...new Set(third.flatMap((u) => [...u.prompts]))].slice(0, 12),
      evidence: third.slice(0, 10).map((u) => ({ label: u.domain + (u.urlType !== "Home" && u.urlType !== "Other" ? ` · ${URL_TR[u.urlType] ?? u.urlType}` : ""), url: u.url, note: `${[...u.comps].join(", ")} anılıyor · ${u.prompts.size} soruda kaynak` })),
      competitors: [...new Set(third.flatMap((u) => [...u.comps]))],
    });
  }

  // 3) Topluluk (Reddit, Ekşi, YouTube, Quora…)
  const ugc = all.filter((u) => u.type === "UGC");
  if (ugc.length) {
    out.push({
      id: "community",
      type: "community",
      title: `AI cevapları ${[...new Set(ugc.map((u) => u.domain))].slice(0, 3).join(", ")} tartışmalarına dayanıyor`,
      why: "Perplexity ve ChatGPT, kullanıcı deneyimi sorularında forum, video ve sözlük içeriklerini sık alıntılar. Bu kanallarda gerçek, faydalı bir varlığın yoksa cevaplarda da yoksun.",
      steps: [
        "Listedeki başlıkları oku; markanla gerçekten ilgili olanlarda kendini tanıtarak faydalı bir cevap yaz (reklam değil, çözüm).",
        "Sahte hesap, toplu yorum ya da yönlendirme kullanma; platform kurallarına aykırıdır ve markaya zarar verir.",
        "YouTube'da konuyu anlatan kısa bir video, AI'ın alıntılayabileceği kalıcı bir kaynak olur.",
      ],
      impact: ugc.reduce((s, u) => s + u.n, 0),
      effort: "Orta",
      prompts: [...new Set(ugc.flatMap((u) => [...u.prompts]))].slice(0, 12),
      evidence: ugc.slice(0, 10).map((u) => ({ label: u.domain, url: u.url, note: `${u.prompts.size} soruda kaynak${u.comps.size ? ` · ${[...u.comps].join(", ")} anılıyor` : ""}` })),
      competitors: [...new Set(ugc.flatMap((u) => [...u.comps]))],
    });
  }

  // 4) Rakibin kendi sayfaları kaynak gösterilmiş → karşılaştırma / alternatif sayfası
  const comp = all.filter((u) => u.type === "Competitor");
  if (comp.length) {
    out.push({
      id: "counter",
      type: "counter",
      title: `AI, rakiplerinin ${comp.length} sayfasını kaynak gösteriyor`,
      why: "Rakibin kendi sayfası cevabın kaynağıysa, aynı soruyu daha iyi cevaplayan bir sayfan yoktur ya da AI onu bulamıyordur.",
      steps: [
        "Listedeki her rakip sayfasının hangi soruyu cevapladığına bak; aynı konuda daha kapsamlı ve güncel bir sayfa hazırla.",
        "Uygunsa \"[Rakip] alternatifi\" ya da \"[Sen] vs [Rakip]\" karşılaştırma sayfası yap; yalnızca doğrulanabilir farkları yaz.",
        "Sayfaya FAQPage ve Organization şeması ekle, iç linklerle güçlendir.",
      ],
      impact: comp.reduce((s, u) => s + u.n, 0),
      effort: "Orta",
      prompts: [...new Set(comp.flatMap((u) => [...u.prompts]))].slice(0, 12),
      evidence: comp.slice(0, 10).map((u) => ({ label: u.domain + ` · ${URL_TR[u.urlType] ?? u.urlType}`, url: u.url, note: `${u.prompts.size} soruda kaynak` })),
      competitors: [...new Set(comp.map((u) => u.domain))],
    });
  }

  // 5) Kendi sitemiz kaynak ama marka adı cevapta yok
  const ownCited = runs.filter((r) => !r.mentioned && r.citations.some((c) => clean(c.domain) === ownD));
  if (ownCited.length) {
    const ownUrls = [...new Set(ownCited.flatMap((r) => r.citations.filter((c) => clean(c.domain) === ownD).map((c) => c.url)))];
    out.push({
      id: "own-page",
      type: "own-page",
      title: `${ownCited.length} cevapta sayfan kaynak ama marka adın geçmiyor`,
      why: "AI bilgiyi senin sayfandan alıyor ama markayı anmıyor. Genelde sayfada marka adı, kim olduğun ve neyi farklı yaptığın net yazmadığı için olur.",
      steps: [
        "Bu sayfaların ilk paragrafına marka adını ve ne yaptığını tek cümlede yaz (\"Epicsem, … yapan bir …dır\").",
        "Sayfaya Organization şeması ve yazar/uzman bilgisi ekle.",
        "Önemli bilgileri marka adıyla birlikte veren alıntılanabilir cümleler kur (\"… müşterilerimizde ortalama …\").",
      ],
      impact: ownCited.length,
      effort: "Kolay",
      prompts: [...new Set(ownCited.map((r) => r.promptText))].slice(0, 12),
      evidence: ownUrls.slice(0, 10).map((u) => ({ label: u.replace(/^https?:\/\/(www\.)?/, ""), url: u })),
      competitors: [],
    });
  }

  // 6) Ansiklopedi / resmi kaynak
  const ref = all.filter((u) => u.type === "Reference" || u.type === "Government");
  if (ref.length) {
    out.push({
      id: "entity",
      type: "entity",
      title: `Cevaplar ${[...new Set(ref.map((u) => u.domain))].slice(0, 2).join(" ve ")} gibi bilgi kaynaklarına dayanıyor`,
      why: "Wikipedia, Wikidata ve resmi kurum sayfaları AI motorlarının \"gerçek\" kabul ettiği kaynaklardır. Markanın bu ekosistemde tanımlı bir varlık olması görünürlüğü kalıcı olarak artırır.",
      steps: [
        "Bilgi grafı sekmesinden markanın Wikidata kaydını kontrol et; yoksa kurallara uygun, kaynaklı bir kayıt aç.",
        "Wikipedia'ya kendin tanıtım yazısı ekleme; bağımsız haber kaynakları oluştukça editörler ekler.",
        "Sektör birlikleri, odalar ve resmi dizinlerdeki kayıtlarını güncelle.",
      ],
      impact: ref.reduce((s, u) => s + u.n, 0),
      effort: "Zor",
      prompts: [...new Set(ref.flatMap((u) => [...u.prompts]))].slice(0, 12),
      evidence: ref.slice(0, 8).map((u) => ({ label: u.domain, url: u.url })),
      competitors: [],
    });
  }

  // 7) Algı: anıldığı cevaplarda duygu düşük
  const neg = runs.filter((r) => r.mentioned && r.sentiment != null && r.sentiment < 50);
  if (neg.length) {
    out.push({
      id: "sentiment",
      type: "sentiment",
      title: `${neg.length} cevapta markan olumsuz ya da çekimser anılıyor`,
      why: "Anılmak tek başına yetmez; AI motorları şikâyet sitelerinden ve eski yorumlardan olumsuz bir tablo çıkarıyor olabilir.",
      steps: [
        "Aşağıdaki cevapları açıp olumsuzluğun kaynağını bul (şikâyet, eski fiyat, yanlış bilgi).",
        "Haklı şikâyetleri çöz ve kamuya açık yanıt ver; yanlış bilgiyi kendi sayfanda net ve kaynaklı şekilde düzelt.",
        "Memnun müşterilerden gerçek yorum iste (yorum satın alma ya da sahte yorum yazdırma).",
      ],
      impact: neg.length,
      effort: "Zor",
      prompts: [...new Set(neg.map((r) => r.promptText))].slice(0, 12),
      evidence: neg.slice(0, 8).map((r) => ({ label: r.promptText, note: `Duygu ${r.sentiment}/100 · ${r.engine}` })),
      competitors: [],
    });
  }

  return out.sort((a, b) => b.impact - a.impact);
}

const URL_TR: Record<string, string> = {
  Home: "Ana sayfa",
  Category: "Kategori",
  Product: "Ürün",
  Listicle: "Liste yazısı",
  Comparison: "Karşılaştırma",
  Profile: "Profil",
  Alternative: "Alternatif",
  Discussion: "Tartışma",
  HowTo: "Nasıl yapılır",
  Article: "Makale",
  Other: "Diğer",
};

/** Liste/haber sitesine gönderilecek kişisel e-posta taslağı (AI'sız şablon; gönderilmez, kullanıcı düzenler). */
export function pitchTemplate(own: BrandRef, target: { label: string; url?: string }, competitors: string[]): string {
  return `Konu: ${target.label.split(" · ")[0]} — ${own.name} için kısa bir öneri

Merhaba [İsim],

${target.url ? `"${target.url}" yazınızı okudum` : "Yazınızı okudum"}; ${competitors.length ? `${competitors.slice(0, 2).join(" ve ")} gibi markaları` : "sektördeki markaları"} karşılaştırmanız çok faydalı.

${own.name} (${own.domain}) olarak [tek cümle: ne yaptığınız]. Okurlarınız için şu açıdan farklı bir seçenek olabiliriz: [somut fark — fiyat, hizmet bölgesi, uzmanlık, veri].

Uygun görürseniz bir sonraki güncellemede değerlendirmeniz için [demo / örnek / veri] paylaşabilirim. Hiçbir ücretli yerleşim talebimiz yok.

Teşekkürler,
[Adınız] · ${own.name}`;
}
