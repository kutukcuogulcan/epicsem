import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { sitePagesForLinks } from "@/lib/article-enrich";
import { trLower } from "@/lib/text-match";

/** Agent'ların ortak araçları ve yardımcıları (GEO agent'ı, kelime agent'ı). */

/** Markanın sitesindeki sayfalar (tarama/sitemap); bulunan adresler `seen` kümesine yazılır (rapor doğrulaması için). */
export function ownPagesTool(userId: number, domain: string, trace: string[], seen: Set<string>) {
  return betaZodTool({
    name: "list_own_pages",
    description: `List pages that exist on ${domain} (from the site crawl / sitemap), optionally filtered by words, to check whether the brand already has a page for a topic before recommending a new one.`,
    inputSchema: z.object({ query: z.string().optional().describe("Words to filter titles/URLs, e.g. 'e-fatura'") }),
    run: async ({ query }) => {
      const pages = await sitePagesForLinks(userId, domain, 200).catch(() => []);
      const words = trLower(query ?? "").split(/\s+/).filter((w) => w.length > 2);
      const hit = pages.filter((p) => !words.length || words.some((w) => trLower(`${p.title} ${p.url}`).includes(w))).slice(0, 25);
      hit.forEach((p) => seen.add(p.url));
      trace.push(`Kendi sitesine baktı${query ? `: "${query}"` : ""} (${hit.length} sayfa)`);
      return hit.length ? hit.map((p) => `${p.title} — ${p.url}`).join("\n") : "Eşleşen sayfa yok (ya da site henüz taranmadı).";
    },
  });
}

/** Konuşmadaki web araması sonuçlarının gerçek adresleri (agent'ın gösterdiği "ilk sonuçlar" bunlarla doğrulanır). */
export function searchResultUrls(messages: readonly { role: string; content?: unknown }[]): Set<string> {
  const out = new Set<string>();
  for (const m of messages) {
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    for (const b of m.content as any[]) {
      if (b?.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
      for (const r of b.content) if (typeof r?.url === "string") out.add(r.url);
    }
  }
  return out;
}

export const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
