import { geminiGenerate } from "@/lib/gemini";

/**
 * Topluluk bahsetmeleri — bir markanın Donanımhaber, ŞikayetVar, Quora, YouTube ve Medium'da
 * konuşulduğu sayfalar. Bu sitelerin herkese açık "bu siteye link verenler" servisi yok ve
 * doğrudan aramaları botlara kapalı (403), bu yüzden Gemini + Google Search grounding ile
 * TEK sorguda site:... aramaları yapılır.
 *
 * Uydurma yok: modelin yazdığı metin KULLANILMAZ (testte Ekşi Sözlük için olmayan adresler
 * yazdı). Yalnızca Google'ın döndürdüğü gerçek kaynaklar (groundingChunks) alınır, yönlendirme
 * bağlantısı gerçek adrese çözülür ve adres beklenen siteye ait değilse atılır.
 * Ekşi Sözlük, Technopat ve LinkedIn bu yolla güvenilir sonuç vermediği için listede yok.
 */

export type CommunitySiteId = "donanimhaber" | "sikayetvar" | "quora" | "youtube" | "medium";

export const COMMUNITY_SITES: { id: CommunitySiteId; host: string; label: string }[] = [
  { id: "donanimhaber", host: "forum.donanimhaber.com", label: "Donanımhaber" },
  { id: "sikayetvar", host: "sikayetvar.com", label: "ŞikayetVar" },
  { id: "quora", host: "quora.com", label: "Quora" },
  { id: "youtube", host: "youtube.com", label: "YouTube" },
  { id: "medium", host: "medium.com", label: "Medium" },
];

export interface CommunityMention {
  site: CommunitySiteId;
  url: string;
  title: string;
}

export function communitySearchAvailable(): boolean {
  return Boolean(process.env.GOOGLE_AI_API_KEY);
}

const siteOf = (u: string): CommunitySiteId | null => {
  let h: string;
  try {
    h = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (h === "m.youtube.com" || h === "youtu.be") return "youtube";
  for (const s of COMMUNITY_SITES) {
    const base = s.host.replace(/^forum\./, "");
    if (h === s.host || h === base || h.endsWith("." + base)) return s.id;
  }
  return null;
};

/** Google yönlendirme bağlantısını gerçek adrese çözer (sayfayı indirmeden). */
async function resolveRedirect(u: string): Promise<string | null> {
  if (!/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/.test(u)) return u;
  try {
    const r = await fetch(u, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000) });
    return r.headers.get("location");
  } catch {
    return null;
  }
}

/** URL'den okunabilir başlık (slug); YouTube için oEmbed başlığı. */
async function titleFor(url: string, site: CommunitySiteId): Promise<string> {
  if (site === "youtube") {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const j = await r.json();
        if (j?.title) return String(j.title).slice(0, 200);
      }
    } catch {
      /* slug yok — aşağıdaki varsayılan */
    }
    return "YouTube videosu";
  }
  let path = "";
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return url;
  }
  const last = path.split("/").filter(Boolean).pop() ?? "";
  const slug = last
    .replace(/--\d+$/, "") // donanımhaber konu numarası
    .replace(/-[0-9a-f]{10,}$/i, "") // medium yazı kimliği
    .replace(/[-_]+/g, " ")
    .trim();
  if (!slug) return url;
  return (slug.charAt(0).toLocaleUpperCase("tr") + slug.slice(1)).slice(0, 200);
}

/** Bir markanın topluluk sitelerindeki bahsetmeleri (en fazla ~20). Hata ya da anahtar yoksa boş liste. */
export async function communityMentions(brand: string, ownDomain?: string): Promise<CommunityMention[]> {
  if (!communitySearchAvailable() || !brand.trim()) return [];
  const sites = COMMUNITY_SITES.map((s) => s.host).join(", ");
  const prompt = `Search Google for discussions, questions, reviews, complaints and videos about "${brand}"${ownDomain ? ` (${ownDomain})` : ""} on these sites only: ${sites}. Run a separate search per site using site:... . Then list the pages you found.`;
  let chunks: { web?: { uri?: string } }[] = [];
  try {
    const { data } = await geminiGenerate({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }, { signal: AbortSignal.timeout(60_000) });
    chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  } catch {
    return [];
  }
  const urls = await Promise.all(chunks.slice(0, 30).map((c) => resolveRedirect(String(c.web?.uri ?? ""))));
  const seen = new Set<string>();
  const picked: { url: string; site: CommunitySiteId }[] = [];
  for (const u of urls) {
    if (!u) continue;
    const site = siteOf(u);
    if (!site) continue;
    const clean = u.replace(/[?#].*$/, (m) => (site === "youtube" ? m.replace(/&.*$/, "") : ""));
    if (seen.has(clean)) continue;
    seen.add(clean);
    picked.push({ url: clean, site });
  }
  const out = await Promise.all(picked.slice(0, 20).map(async (p) => ({ ...p, title: await titleFor(p.url, p.site) })));
  return out;
}
