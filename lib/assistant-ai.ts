import { getGeoOpportunities, getLatestGeoRunFull } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { buildGeoReport } from "@/lib/geo-report";
import { summaryFacts, type GeoSummary } from "@/lib/geo-summary";
import { runSmallAiJson } from "@/lib/ai-small";
import { answer, type AssistantReply, type Block } from "@/lib/seo-assistant";

/** Asistanın bağlantı verebileceği sayfalar (AI başka adres uyduramaz). */
const PAGES: Record<string, string> = {
  "/geo": "GEO görünürlük",
  "/geo/rapor": "GEO raporu",
  "/brand-monitors": "Marka monitörleri",
  "/audit": "Site denetimi",
  "/import": "Site gezgini",
  "/keywords": "Anahtar kelime planlayıcı",
  "/editor": "Yazı editörü",
  "/campaigns": "Autoblog",
  "/monitor": "Sayfa izleme",
  "/backlinks": "Backlinkler",
  "/rankings": "Sıralama takibi",
  "/local": "Yerel SEO",
};

const flatten = (blocks: Block[]) =>
  blocks
    .map((b) => (b.type === "text" ? b.text : b.type === "list" ? b.items.map((i) => `- ${i}`).join("\n") : b.type === "metrics" ? b.items.map((m) => `${m.label}: ${m.value}`).join(", ") : ""))
    .filter(Boolean)
    .join("\n");

/**
 * Arvow'daki AI Chat gibi: kullanıcının serbest sorusunu projenin gerçek verileriyle (GEO raporu, AI özeti, site denetimi)
 * cevaplar. 1 AI sorgusu / mesaj. Olgu yoksa ne eksik olduğunu ve hangi aracın vereceğini söyler; uydurmaz.
 */
export async function aiAnswer(userId: number, message: string, site: string): Promise<AssistantReply> {
  const proj = await getActiveProject(userId, site).catch(() => null);
  const geo = (await getLatestGeoRunFull(userId, site)) ?? (await getLatestGeoRunFull(userId, `www.${site}`));
  const parts: string[] = [];
  if (geo?.runs.length && !geo.demoMode) {
    const own = { name: geo.brand.name, domain: geo.brand.domain, aliases: proj?.aliases ?? [] };
    const report = buildGeoReport(geo.runs, own, proj?.competitors.length ? proj.competitors : geo.competitors);
    parts.push(`GEO (AI görünürlüğü) — son test ${geo.createdAt.slice(0, 10)}:\n${summaryFacts(geo.brand.name, report, null)}`);
    const sum = await getGeoOpportunities<GeoSummary>(userId, geo.brand.domain, `summary:${geo.createdAt}`).catch(() => null);
    if (sum) parts.push(`AI özetindeki öncelikli işler:\n${sum.actions.map((a) => `- ${a.action} (${a.why}; etki ${a.impact}, efor ${a.effort})`).join("\n")}`);
  } else parts.push("GEO: bu site için gerçek bir GEO testi yok.");
  const focus = await answer(userId, "Bu hafta neye odaklanmalıyım?", site).catch(() => null);
  if (focus) parts.push(`Site taraması / denetim bulguları:\n${flatten(focus.blocks)}`);

  const raw = await runSmallAiJson(
    userId,
    `Sen Epicsem'in SEO ve GEO (AI görünürlüğü) asistanısın. Kullanıcının sitesi: ${site}. Aşağıdaki OLGULAR bu sitenin Epicsem'deki gerçek verileridir.
OLGULAR:
${parts.join("\n\n").slice(0, 9000)}

KULLANICININ SORUSU: "${message}"

Türkçe, kısa ve somut cevap ver (en fazla ~150 kelime, markdown; gerekiyorsa madde listesi). Yalnızca olgulardaki sayıları, markaları, soruları ve siteleri kullan; olgularda olmayan bir şeyi (trafik, gelir, sıralama vb.) uydurma — o veri yoksa açıkça "bu veri Epicsem'de yok" de ve hangi aracın vereceğini söyle.
İlgili sayfalara en fazla 3 bağlantı öner; yalnızca şu adresleri kullan: ${Object.entries(PAGES).map(([h, l]) => `${h} (${l})`).join(", ")}.
Yalnızca JSON döndür: {"answer":"markdown cevap","links":["/geo/rapor"]}`
  );
  const text = typeof raw.answer === "string" && raw.answer.trim() ? raw.answer.trim().slice(0, 3000) : null;
  if (!text) throw new Error("Boş cevap");
  const links = (Array.isArray(raw.links) ? raw.links : []).map(String).filter((h) => h in PAGES).slice(0, 3);
  const blocks: Block[] = [{ type: "text", text }];
  if (links.length) blocks.push({ type: "actions", items: links.map((h) => ({ label: PAGES[h], href: h })) });
  return { intent: "ai", blocks };
}
