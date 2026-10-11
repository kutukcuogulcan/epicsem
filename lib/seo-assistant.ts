/**
 * SEO Asistanı — AI KULLANMAZ. Kullanıcının sorusunu anahtar kelimelerle bir "niyete"
 * eşler, kayıtlı verilerden (Site Taraması, GEO/AEO, Gap Analysis) cevabı kurallarla
 * üretir. Maliyet: 0. Her cevap gerçek veriye dayanır; veri yoksa ne çalıştırılması
 * gerektiğini söyler.
 */
import type { BulkImportResult, BulkImportRow, GeoVisibilitySummary } from "@/types";
import { getLatestCrawls, getLatestGapRunBriefs, getLatestGeoRuns } from "@/lib/db";
import { ISSUE_INFO, ISSUE_LABEL, ISSUE_SEVERITY, SEVERITY_LABEL, priorityScore } from "@/lib/bulk-labels";

export type Block =
  | { type: "text"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "metrics"; items: { label: string; value: string; tone?: "good" | "bad" | "warn" }[] }
  | { type: "actions"; items: { label: string; href: string }[] }
  | { type: "suggest"; items: string[] };

export interface AssistantReply {
  intent: string;
  blocks: Block[];
}

const tr = (s: string) => s.toLocaleLowerCase("tr").normalize("NFC");
const pct = (x: number) => `%${Math.round(x * 100)}`;
const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "");
const has = (m: string, words: string[]) => words.some((w) => m.includes(w));

const SUGGESTIONS = [
  "Bu hafta neye odaklanmalıyım?",
  "Sitemin genel durumu nasıl?",
  "ChatGPT'de neden rakiplerim çıkıyor?",
  "Ne yazmalıyım?",
  "Geçen taramaya göre ne değişti?",
  "Kırık sayfalar hangileri?",
  "Meta açıklaması eksik sayfalar",
];

async function loadSite(userId: number, site: string) {
  const variants = [site, `www.${site}`, `https://${site}`, `https://www.${site}`];
  const crawls = await getLatestCrawls(userId, site, 2);
  let geo: Awaited<ReturnType<typeof getLatestGeoRuns>> = [];
  let gap: Awaited<ReturnType<typeof getLatestGapRunBriefs>> = null;
  for (const v of variants) {
    if (!geo.length) geo = await getLatestGeoRuns(userId, v, 2);
    if (!gap) gap = await getLatestGapRunBriefs(userId, v);
  }
  return { crawl: crawls[0]?.result ?? null, crawlAt: crawls[0]?.createdAt ?? null, prevCrawl: crawls[1]?.result ?? null, geo: geo[0] ?? null, prevGeo: geo[1] ?? null, gap };
}

function issueCounts(r: BulkImportResult) {
  const c: Record<string, number> = {};
  for (const row of r.rows) for (const i of row.issues) c[i] = (c[i] ?? 0) + 1;
  return c;
}
function health(r: BulkImportResult) {
  if (r.summary.healthScore != null) return r.summary.healthScore;
  const html = r.rows.filter((x) => x.statusCode !== null);
  const bad = html.filter((x) => x.issues.some((i) => ISSUE_SEVERITY[i] === "error")).length;
  return html.length ? Math.round(((html.length - bad) / html.length) * 100) : 0;
}
function ownSummary(geo: { summaries: GeoVisibilitySummary[]; brandName: string }, site: string) {
  return geo.summaries.find((s) => s.domain.replace(/^www\./, "").includes(site) || site.includes(s.domain.replace(/^www\./, ""))) ?? geo.summaries.find((s) => s.brand === geo.brandName) ?? null;
}
function rowsWith(r: BulkImportResult, code: string) {
  return r.rows.filter((x) => x.issues.includes(code));
}
function topPlan(r: BulkImportResult, n = 5) {
  const c = issueCounts(r);
  return Object.entries(c)
    .filter(([k]) => ISSUE_SEVERITY[k] !== "notice")
    .map(([k, v]) => ({ code: k, n: v, p: priorityScore(k, v) + (ISSUE_SEVERITY[k] === "error" ? 3 : 0) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, n);
}

/** Sorudaki sorun adını sorun koduna eşler ("alt metni", "canonical", "404"…). */
const ISSUE_ALIASES: [string[], string][] = [
  [["kırık", "404", "bulunamad", "broken", "açılmayan"], "broken"],
  [["meta açıklama", "meta description", "açıklama eksik", "description"], "missing-meta-description"],
  [["title", "başlık etiketi", "sayfa başlığı"], "missing-title"],
  [["h1"], "missing-h1"],
  [["alt metni", "alt text", "alt etiketi", "görsel açıklama"], "images-missing-alt"],
  [["canonical"], "missing-canonical"],
  [["schema", "yapısal veri", "json-ld"], "missing-schema"],
  [["yavaş", "hız", "speed", "yanıt süresi"], "slow-response"],
  [["yönlendirme zinciri", "redirect chain", "zincir"], "redirect-chain"],
  [["yetim", "orphan"], "orphan-page"],
  [["ince içerik", "yetersiz içerik", "thin", "kelime az", "kısa içerik"], "thin-content"],
  [["noindex", "indekslen"], "noindex-tag"],
  [["kopya", "duplicate", "aynı içerik", "tekrarlayan"], "near-duplicate"],
  [["https", "ssl", "güvenli"], "no-https"],
  [["viewport", "mobil"], "missing-viewport"],
  [["büyük görsel", "görsel boyut", "resim boyutu"], "large-images"],
];

export async function answer(userId: number, message: string, site: string | null): Promise<AssistantReply> {
  const m = tr(message);
  if (!site) {
    return {
      intent: "no-site",
      blocks: [
        { type: "text", text: "Hangi site için soruyorsun? Yukarıdan bir site seç. Listede hiç site yoksa önce bir **Site Taraması** ya da **GEO testi** çalıştır; cevaplarımı o verilerden çıkarıyorum." },
        { type: "actions", items: [{ label: "Site Taraması", href: "/import" }, { label: "GEO testi", href: "/geo" }] },
      ],
    };
  }
  const d = await loadSite(userId, site);
  const noCrawl: Block[] = [
    { type: "text", text: `**${site}** için henüz site taraması yok. Önce taramayı çalıştır, sonra tekrar sor.` },
    { type: "actions", items: [{ label: "Siteyi tara", href: "/import" }] },
  ];
  const noGeo: Block[] = [
    { type: "text", text: `**${site}** için henüz GEO/AEO testi yok — AI motorlarındaki görünürlüğü bilmiyorum.` },
    { type: "actions", items: [{ label: "GEO testini başlat", href: "/geo" }] },
  ];

  /* ---------- 1) Belirli bir sorun hakkında ("alt metni eksik sayfalar", "canonical nasıl düzeltilir") ---------- */
  const alias = ISSUE_ALIASES.find(([ws]) => has(m, ws));
  const wantsFocus = has(m, ["odak", "öncelik", "ne yapmalı", "neye", "nereden başla", "bu hafta", "bu ay", "yapılacak", "plan"]);
  const wantsGeo = has(m, ["chatgpt", "gemini", "claude", "perplexity", "yapay zeka", "yapay zekâ", " ai", "ai'", "görünürlük", "anıl", "rakip", "geo", "llm"]);
  const wantsContent = has(m, ["ne yaz", "içerik fikri", "makale", "blog", "konu öner", "yazı fikri", "içerik öner"]);
  const wantsChange = has(m, ["değiş", "karşılaştır", "geçen", "önceki", "ilerleme", "gelişme", "düzeldi"]);
  const wantsStatus = has(m, ["durum", "özet", "genel", "skor", "sağlık", "nasıl gidiyor", "rapor"]);

  if (alias && !wantsFocus && !wantsGeo) {
    if (!d.crawl) return { intent: "issue", blocks: noCrawl };
    const code = alias[1] === "missing-title" && has(m, ["uzun"]) ? "title-too-long" : alias[1] === "missing-meta-description" && has(m, ["uzun"]) ? "meta-description-too-long" : alias[1];
    const rows = rowsWith(d.crawl, code);
    const info = ISSUE_INFO[code];
    const blocks: Block[] = [];
    blocks.push({
      type: "text",
      text: rows.length
        ? `**${ISSUE_LABEL[code]}** — son taramada **${rows.length} sayfada** var (${SEVERITY_LABEL[ISSUE_SEVERITY[code] ?? "notice"]}).`
        : `Son taramada **${ISSUE_LABEL[code] ?? code}** sorunu yok. 👍`.replace(" 👍", ""),
    });
    if (rows.length) blocks.push({ type: "list", items: rows.slice(0, 10).map((r) => short(r.url)) });
    if (rows.length > 10) blocks.push({ type: "text", text: `…ve ${rows.length - 10} sayfa daha.` });
    if (info && (rows.length || has(m, ["nasıl", "düzelt", "çöz"]))) {
      blocks.push({ type: "text", text: `**Neden önemli:** ${info.why}` });
      blocks.push({ type: "text", text: "**Nasıl düzeltilir:**" });
      blocks.push({ type: "list", items: info.steps, ordered: true });
    }
    const acts: { label: string; href: string }[] = [{ label: "Raporda aç", href: "/import" }];
    if (rows[0]) acts.push({ label: "İlk sayfayı Editör'de aç", href: `/editor?url=${encodeURIComponent(rows[0].url)}` });
    blocks.push({ type: "actions", items: acts });
    return { intent: "issue", blocks };
  }

  /* ---------- 2) AI görünürlüğü / rakipler ---------- */
  if (wantsGeo && !wantsFocus) {
    if (!d.geo) return { intent: "geo", blocks: noGeo };
    const g = d.geo;
    const me = ownSummary(g, site);
    const ranked = [...g.summaries].sort((a, b) => b.visibility - a.visibility);
    const ahead = me ? ranked.filter((s) => s !== me && s.visibility > me.visibility) : [];
    const weak = [...g.topics].filter((t) => t.totalCount > 0 && t.visibility < 0.67).sort((a, b) => a.visibility - b.visibility).slice(0, 4);
    const prevMe = d.prevGeo ? ownSummary(d.prevGeo, site) : null;
    const topSources = [...g.sources].filter((s: any) => !String(s.domain ?? "").replace(/^www\./, "").includes(site)).sort((a: any, b: any) => (b.count ?? b.citations ?? 0) - (a.count ?? a.citations ?? 0)).slice(0, 5);
    const blocks: Block[] = [];
    blocks.push({
      type: "metrics",
      items: [
        { label: "Görünürlük", value: me ? pct(me.visibility) : "—", tone: me && me.visibility >= 0.5 ? "good" : "bad" },
        { label: "Share of voice", value: me ? pct(me.shareOfVoice) : "—" },
        { label: "Ort. sıra", value: me?.avgPosition != null ? `#${me.avgPosition.toFixed(1)}` : "—" },
        { label: "Önceki teste göre", value: me && prevMe ? `${Math.round((me.visibility - prevMe.visibility) * 100) >= 0 ? "+" : ""}${Math.round((me.visibility - prevMe.visibility) * 100)} puan` : "—" },
      ],
    });
    if (ahead.length) {
      blocks.push({ type: "text", text: `AI cevaplarında senden **daha sık** anılan markalar:` });
      blocks.push({ type: "list", items: ahead.slice(0, 5).map((s) => `**${s.brand}** — ${pct(s.visibility)} görünürlük, ${pct(s.shareOfVoice)} pay`) });
    } else if (me && me.visibility >= 0.6) {
      blocks.push({ type: "text", text: "Son testte **rakiplerinden önde** görünüyorsun." });
    } else if (me) {
      blocks.push({ type: "text", text: `Test edilen rakiplerin hiçbiri senden sık anılmıyor, ama soruların **${pct(1 - me.visibility)}**'inde hiç anılmıyorsun — AI bu sorularda ya kimseyi önermiyor ya da listede olmayan markaları öneriyor. Bu soruları GEO panosundaki prompt listesinde inceleyebilirsin.` });
    }
    if (!weak.length && g.topics.length) blocks.push({ type: "text", text: "Test edilen tüm konularda AI cevaplarında düzenli anılıyorsun." });
    if (weak.length) {
      blocks.push({ type: "text", text: "En zayıf olduğun konular (AI bu sorularda seni anmıyor):" });
      blocks.push({ type: "list", items: weak.map((t) => `${t.topic} — ${t.mentionedCount}/${t.totalCount} soruda anıldın`) });
    }
    if (topSources.length) {
      blocks.push({ type: "text", text: "AI motorlarının en çok dayandığı kaynaklar (burada yer almak görünürlüğü artırır):" });
      blocks.push({ type: "list", items: topSources.map((s: any) => s.domain) });
    }
    blocks.push({ type: "text", text: "**Ne yapmalı:** zayıf konular için soruya doğrudan cevap veren (cevap-önce, SSS'li, schema'lı) sayfalar yayınla ve yukarıdaki kaynaklarda (rehber siteler, karşılaştırma yazıları, forumlar) markanın geçmesini sağla." });
    blocks.push({ type: "actions", items: [{ label: "GEO panosu", href: "/geo" }, { label: "Gap Analysis", href: "/gap" }, { label: "Editör'de yeni yazı", href: "/editor" }] });
    return { intent: "geo", blocks };
  }

  /* ---------- 3) İçerik fikirleri ---------- */
  if (wantsContent) {
    const ideas: string[] = [];
    for (const b of d.gap?.contentBriefs ?? []) for (const h of b.suggestedHeadings ?? []) if (ideas.length < 8 && !ideas.includes(h)) ideas.push(h);
    const weakTopics = d.geo ? [...d.geo.topics].filter((t) => t.totalCount > 0 && t.visibility < 0.34).map((t) => t.topic) : [];
    const thin = d.crawl ? rowsWith(d.crawl, "thin-content").slice(0, 5) : [];
    const blocks: Block[] = [];
    if (!ideas.length && !weakTopics.length && !thin.length) {
      return {
        intent: "content",
        blocks: [
          { type: "text", text: d.geo && d.geo.topics.length ? `**${site}** için AI testinde zayıf bir konu çıkmadı. Yeni yazı fikirleri için **Gap Analysis** çalıştır — rakiplerin anılıp senin anılmadığın soruları başlığa çevirir.` : `Yazı fikri çıkarmak için **${site}** adına **Gap Analysis** sonucu lazım — rakiplerin anılıp senin anılmadığın soruları başlığa çevirir. (Ya da ilk önce siteyi tara; zayıf sayfaları gösteririm.)` || `İçerik fikri çıkarmak için **${site}** adına Gap Analysis ya da GEO testi sonucu lazım.` },
          { type: "actions", items: [{ label: "Gap Analysis", href: "/gap" }, { label: "GEO testi", href: "/geo" }] },
        ],
      };
    }
    if (ideas.length) {
      blocks.push({ type: "text", text: "AI'da **kaybettiğin sorulardan** çıkan yazı başlıkları (Gap Analysis):" });
      blocks.push({ type: "list", items: ideas, ordered: true });
    }
    if (weakTopics.length) {
      blocks.push({ type: "text", text: "AI cevaplarında neredeyse hiç anılmadığın konular — her biri için bir rehber yazısı:" });
      blocks.push({ type: "list", items: weakTopics.slice(0, 5) });
    }
    if (thin.length) {
      blocks.push({ type: "text", text: "Yeni yazı yerine **genişletilmesi** gereken zayıf sayfalar (200 kelimeden az):" });
      blocks.push({ type: "list", items: thin.map((r) => `${short(r.url)} — ${r.wordCount ?? 0} kelime`) });
    }
    blocks.push({ type: "actions", items: [{ label: "Editör'de yaz", href: "/editor" }, ...(thin[0] ? [{ label: "İlk zayıf sayfayı genişlet", href: `/editor?url=${encodeURIComponent(thin[0].url)}` }] : []), { label: "Content Studio", href: "/content" }] });
    return { intent: "content", blocks };
  }

  /* ---------- 4) Değişim ---------- */
  if (wantsChange) {
    if (!d.crawl) return { intent: "change", blocks: noCrawl };
    if (!d.prevCrawl && !d.prevGeo) {
      return { intent: "change", blocks: [{ type: "text", text: "Karşılaştıracak önceki bir tarama ya da test yok. Siteyi bir kez daha tarayınca farkları söyleyebilirim." }, { type: "actions", items: [{ label: "Yeniden tara", href: "/import" }] }] };
    }
    const blocks: Block[] = [];
    if (d.prevCrawl) {
      const now = issueCounts(d.crawl);
      const before = issueCounts(d.prevCrawl);
      const codes = [...new Set([...Object.keys(now), ...Object.keys(before)])];
      const diffs = codes.map((c) => ({ c, d: (now[c] ?? 0) - (before[c] ?? 0) })).filter((x) => x.d !== 0).sort((a, b) => a.d - b.d);
      const h1 = health(d.crawl);
      const h0 = health(d.prevCrawl);
      blocks.push({ type: "metrics", items: [{ label: "Sağlık skoru", value: `${h0} → ${h1}`, tone: h1 >= h0 ? "good" : "bad" }, { label: "Taranan sayfa", value: `${d.prevCrawl.rows.length} → ${d.crawl.rows.length}` }] });
      const better = diffs.filter((x) => x.d < 0).slice(0, 5);
      const worse = diffs.filter((x) => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 5);
      if (better.length) {
        blocks.push({ type: "text", text: "**Düzelenler:**" });
        blocks.push({ type: "list", items: better.map((x) => `${ISSUE_LABEL[x.c] ?? x.c}: ${-x.d} sayfa azaldı`) });
      }
      if (worse.length) {
        blocks.push({ type: "text", text: "**Kötüleşenler:**" });
        blocks.push({ type: "list", items: worse.map((x) => `${ISSUE_LABEL[x.c] ?? x.c}: ${x.d} sayfa arttı`) });
      }
      if (!better.length && !worse.length) blocks.push({ type: "text", text: "İki tarama arasında sorun sayılarında değişiklik yok." });
    }
    if (d.geo && d.prevGeo) {
      const a = ownSummary(d.geo, site);
      const b = ownSummary(d.prevGeo, site);
      if (a && b) blocks.push({ type: "text", text: `AI görünürlüğün ${pct(b.visibility)} → **${pct(a.visibility)}** oldu.` });
    }
    blocks.push({ type: "actions", items: [{ label: "Karşılaştırma sekmesi", href: "/import" }] });
    return { intent: "change", blocks };
  }

  /* ---------- 5) Genel durum ---------- */
  if (wantsStatus && !wantsFocus) {
    const blocks: Block[] = [];
    if (d.crawl) {
      const c = issueCounts(d.crawl);
      const sev = { error: 0, warning: 0, notice: 0 } as Record<string, number>;
      for (const [k, v] of Object.entries(c)) sev[ISSUE_SEVERITY[k] ?? "notice"] += v;
      blocks.push({ type: "metrics", items: [{ label: "Sağlık skoru", value: String(health(d.crawl)), tone: health(d.crawl) >= 80 ? "good" : health(d.crawl) >= 50 ? "warn" : "bad" }, { label: "Hata", value: String(sev.error), tone: sev.error ? "bad" : "good" }, { label: "Uyarı", value: String(sev.warning), tone: sev.warning ? "warn" : "good" }, { label: "Sayfa", value: String(d.crawl.rows.length) }] });
    }
    if (d.geo) {
      const me = ownSummary(d.geo, site);
      if (me) blocks.push({ type: "text", text: `AI motorlarında görünürlüğün **${pct(me.visibility)}**, rakipler arasında payın **${pct(me.shareOfVoice)}**.` });
    }
    if (!blocks.length) return { intent: "status", blocks: [...noCrawl, ...noGeo] };
    if (d.crawl) {
      const plan = topPlan(d.crawl, 3);
      if (plan.length) {
        blocks.push({ type: "text", text: "En önemli 3 konu:" });
        blocks.push({ type: "list", items: plan.map((p) => `${ISSUE_LABEL[p.code] ?? p.code} — ${p.n} sayfa`), ordered: true });
      }
    }
    blocks.push({ type: "actions", items: [{ label: "Site raporu", href: "/import" }, { label: "GEO panosu", href: "/geo" }] });
    return { intent: "status", blocks };
  }

  if (has(m, ["merhaba", "selam", "yardım", "neler yapabilir", "ne yapabilir", "nasıl kullan"])) {
    return { intent: "help", blocks: [{ type: "text", text: `Merhaba! **${site}** için kayıtlı taramalarına ve AI görünürlük testlerine bakarak cevap veriyorum. Örneğin:` }, { type: "suggest", items: SUGGESTIONS }] };
  }

  /* ---------- 6) Odak / öncelik (varsayılan) ---------- */
  if (wantsFocus || alias || wantsGeo || m.length > 0) {
    if (!d.crawl && !d.geo) return { intent: "focus", blocks: [...noCrawl, ...noGeo] };
    const blocks: Block[] = [];
    const steps: string[] = [];
    if (d.crawl) {
      for (const p of topPlan(d.crawl, 3)) {
        const info = ISSUE_INFO[p.code];
        steps.push(`**${ISSUE_LABEL[p.code] ?? p.code}** (${p.n} sayfa) — ${info?.steps[0] ?? "Raporda ayrıntılara bakın."}`);
      }
    }
    if (d.geo) {
      const weak = [...d.geo.topics].filter((t) => t.totalCount > 0).sort((a, b) => a.visibility - b.visibility)[0];
      if (weak && weak.visibility < 0.5) steps.push(`**AI görünürlüğü:** "${weak.topic}" konusunda ${weak.mentionedCount}/${weak.totalCount} soruda anılıyorsun — bu konuya cevap-önce bir rehber sayfa yaz.`);
    }
    const idea = d.gap?.contentBriefs?.[0]?.suggestedHeadings?.[0];
    if (idea) steps.push(`**Yeni içerik:** "${idea}" başlıklı bir yazı (Gap Analysis'te kaybettiğin soru).`);
    blocks.push({ type: "text", text: `**${site}** için bu haftanın öncelik listesi:` });
    blocks.push({ type: "list", items: steps.length ? steps : ["Kritik bir sorun görünmüyor — yeni içerik ve AI görünürlüğüne odaklan."], ordered: true });
    if (d.crawlAt) blocks.push({ type: "text", text: `_Son tarama: ${new Date(d.crawlAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}_` });
    blocks.push({ type: "actions", items: [{ label: "Site raporu", href: "/import" }, { label: "Editör", href: "/editor" }, ...(d.geo ? [{ label: "GEO panosu", href: "/geo" }] : [])] });
    return { intent: "focus", blocks };
  }

  return { intent: "help", blocks: [{ type: "text", text: "Şunları sorabilirsin:" }, { type: "suggest", items: SUGGESTIONS }] };
}

export const ASSISTANT_SUGGESTIONS = SUGGESTIONS;
export type { BulkImportRow };
