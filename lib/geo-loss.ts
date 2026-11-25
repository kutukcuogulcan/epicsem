import type { GeoRunResult } from "@/types";
import { rankTrackedBrands } from "@/lib/text-match";

/**
 * GEO sonucu — "neden kaybettik?" analizi (AI'sız, ücretsiz, istemcide çalışır).
 * Her koşu (prompt × motor) için cevabın kendisinden ve gösterdiği kaynaklardan
 * gerçek nedenleri çıkarır; tahmin ya da uydurma neden yazmaz. Motor × prompt ısı
 * haritası ve "bu boşluğu kapatacak yazıyı yaz" bağlantısı da buradan beslenir.
 */

export interface BrandRef {
  name: string;
  domain: string;
  /** Alt markalar / ürün adları; cevapta geçerse marka anılmış sayılır. */
  aliases?: string[];
}

export type CellStatus = "won" | "mentioned" | "lost" | "empty";

export interface LossAnalysis {
  status: CellStatus;
  /** Markamızın cevaptaki sırası (takip edilen markalar arasında), anılmadıysa null. */
  ownRank: number | null;
  /** Cevapta anılan rakipler, cevaptaki sırasıyla. */
  rivals: { name: string; rank: number }[];
  /** Cevabın gösterdiği kaynak alan adları (tekil). */
  sources: string[];
  ownCited: boolean;
  /** Kaynak gösterilen rakip alan adları. */
  rivalCited: string[];
  /** Kullanıcıya gösterilecek nedenler (Türkçe, veriye dayalı). */
  reasons: string[];
  /** Kapatmak için ne yazılmalı / yapılmalı (kısa). */
  fix: string;
  demo: boolean;
}

export const STATUS_LABEL: Record<CellStatus, string> = {
  won: "İlk sırada",
  mentioned: "Anıldın",
  lost: "Rakip kazandı",
  empty: "Kimse anılmadı",
};

export const cleanDomain = (d: string) =>
  d.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();

const UGC = ["reddit.com", "youtube.com", "quora.com", "medium.com", "x.com", "twitter.com", "facebook.com", "instagram.com", "tiktok.com", "eksisozluk.com", "linkedin.com", "sikayetvar.com", "donanimhaber.com"];
const MARKET = ["trendyol.com", "hepsiburada.com", "amazon.com.tr", "n11.com", "amazon.com", "akakce.com", "cimri.com"];
const isIn = (d: string, list: string[]) => list.some((u) => d === u || d.endsWith("." + u));

export const isDemoRun = (r: GeoRunResult) => /\[DEMO DATA/i.test(r.responseText) || /demo/i.test(r.model);

/** Cevapta takip edilen markaların sırası — GEO özeti ve panosuyla aynı hesap (lib/text-match). */
export function rankBrands(r: GeoRunResult, own: BrandRef, rivals: BrandRef[]): { ownRank: number | null; rivals: { name: string; rank: number }[] } {
  const ranks = rankTrackedBrands(r.responseText, [own, ...rivals.filter((c) => c.name)], r.mentioned);
  return {
    ownRank: ranks.get(own.name) ?? null,
    rivals: rivals.filter((c) => ranks.has(c.name)).map((c) => ({ name: c.name, rank: ranks.get(c.name)! })).sort((a, b) => a.rank - b.rank),
  };
}

const list = (xs: string[], n = 3) => (xs.length <= n ? xs.join(", ") : `${xs.slice(0, n).join(", ")} ve ${xs.length - n} site daha`);

export function analyzeRun(r: GeoRunResult, own: BrandRef, rivals: BrandRef[]): LossAnalysis {
  const ownDomain = cleanDomain(own.domain);
  const { ownRank, rivals: rv } = rankBrands(r, own, rivals);
  const sources = [...new Set(r.citations.map((c) => cleanDomain(c.domain || c.url)).filter(Boolean))];
  const ownCited = r.citations.some((c) => c.isOwnDomain) || sources.includes(ownDomain);
  const rivalDomains = rivals.map((c) => cleanDomain(c.domain)).filter(Boolean);
  const rivalCited = sources.filter((s) => rivalDomains.includes(s));
  const status: CellStatus = ownRank === 1 ? "won" : ownRank ? "mentioned" : rv.length ? "lost" : "empty";
  const reasons: string[] = [];
  const leader = rv[0];

  if (status === "lost") {
    reasons.push(`AI bu soruda ${rv.map((x) => `${x.name} (${x.rank}.)`).join(", ")} önerdi; ${own.name} hiç anılmadı.`);
  } else if (status === "empty") {
    reasons.push(`Cevapta takip ettiğin markaların hiçbiri anılmadı. Soru hâlâ boş alan: ilk net, kaynak gösterilebilir cevabı veren kazanır.`);
  } else if (status === "mentioned" && leader) {
    reasons.push(`${own.name} anıldı ama ${ownRank}. sırada; önce ${rv.filter((x) => x.rank < (ownRank ?? 99)).map((x) => x.name).join(", ")} geldi.`);
  } else if (status === "won") {
    reasons.push(`${own.name} bu cevapta takip edilen markalar arasında ilk sırada anıldı.`);
  }

  if (status !== "won") {
    if (rivalCited.length) reasons.push(`Rakibin kendi sitesi kaynak gösterildi (${rivalCited.join(", ")}): bu soruyu doğrudan cevaplayan bir sayfaları var.`);
    if (sources.length && !ownCited) {
      const ugc = sources.filter((s) => isIn(s, UGC));
      const market = sources.filter((s) => isIn(s, MARKET));
      reasons.push(`Cevap ${sources.length} kaynağa dayandı (${list(sources)}); hiçbirinde senin siten yok.`);
      if (ugc.length) reasons.push(`Topluluk kaynakları belirleyici (${list(ugc, 2)}): oradaki konuşmalarda markan geçmiyor.`);
      if (market.length) reasons.push(`Pazar yeri sayfaları kaynak gösterildi (${list(market, 2)}): ürün listelemen ve yorumların burada etkili.`);
    }
    if (ownCited && !r.mentioned) reasons.push(`Siten kaynak olarak kullanıldı ama markan adıyla anılmadı: sayfadaki cevap cümlesinde marka adı geçmiyor olabilir.`);
    if (!sources.length && status !== "mentioned")
      reasons.push(`Motor kaynak göstermedi, eğitim verisinden cevapladı. Burada belirleyici olan, markanın web'de bu konuyla birlikte ne sıklıkla anıldığı.`);
    if (r.branded && !r.mentioned) reasons.push(`Soru markanın adını içerdiği halde cevapta anılmadın: AI markanı bu konuyla eşleştirmiyor.`);
  }
  if (r.sentiment != null && r.mentioned && r.sentiment < 45) reasons.push(`Anıldığın cümlelerin tonu olumsuz (duygu ${r.sentiment}/100).`);

  const fix =
    status === "won"
      ? "Konumunu korumak için sayfayı güncel tut ve aynı soruyu birkaç hafta sonra yeniden test et."
      : rivalCited.length
        ? `Bu soruyu ilk paragrafta doğrudan cevaplayan, ${leader ? `${leader.name} ile karşılaştırma tablosu içeren ` : ""}bir sayfa yayınla.`
        : sources.length && !ownCited
          ? `Bu soruyu doğrudan cevaplayan bir yazı yayınla ve AI'ın baktığı ${list(sources, 2)} gibi sitelerde anılmaya çalış.`
          : `Bu soruyu doğrudan cevaplayan, alıntılanabilir bir yazı yayınla (cevap-önce giriş, SSS, kaynaklar).`;

  return { status, ownRank, rivals: rv, sources, ownCited, rivalCited, reasons, fix, demo: isDemoRun(r) };
}

/** Yazı sihirbazını bu boşluk için hazır açan editör bağlantısı. */
/** queries: motorların bu soruyu cevaplarken yaptığı web aramaları (fan-out) — yazı bunları da cevaplamalı. */
export function writeGapHref(prompt: string, own: BrandRef, a: Pick<LossAnalysis, "rivals" | "sources" | "status">[], queries: string[] = []): string {
  const rivals = [...new Set(a.flatMap((x) => x.rivals.map((r) => r.name)))].slice(0, 3);
  const sources = [...new Set(a.flatMap((x) => x.sources))].slice(0, 4);
  const parts = [
    `Bu yazı, AI asistanlarına sorulan "${prompt}" sorusunda ${own.name} markasının anılması için yazılıyor.`,
    rivals.length ? `Şu an AI bu soruda ${rivals.join(", ")} öneriyor; adil bir karşılaştırma bölümü ve tablo ekle, rakipler hakkında bilgi uydurma.` : `Şu an AI bu soruda kimseyi önermiyor; ilk net cevabı ver.`,
    `İlk paragrafta soruyu 2-3 cümlede doğrudan cevapla, ${own.name} çözümünü gerçek bilgiyle anlat, sonunda SSS bölümü olsun.`,
    queries.length ? `AI bu soruyu cevaplarken şunları aradı; her birini yazıda bir başlık ya da paragrafla cevapla: ${queries.slice(0, 8).join(" | ")}.` : "",
    sources.length ? `AI'ın bu soruda baktığı kaynaklar: ${sources.join(", ")}.` : "",
  ].filter(Boolean);
  const kw = prompt.replace(/[?!.]+$/, "").slice(0, 100);
  return `/editor?write=1&kw=${encodeURIComponent(kw)}&title=${encodeURIComponent(prompt.slice(0, 200))}&note=${encodeURIComponent(parts.join(" ").slice(0, 1200))}`;
}
