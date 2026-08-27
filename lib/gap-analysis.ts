import { runSeoAudit } from "./seo-audit";
import type { GapRow, GeoRunResult, SeoAuditResult } from "@/types";

/**
 * The core differentiator over Peec AI / Seobility: neither cross-references *which specific
 * pages* get technically audited against *which pages actually get cited* by AI engines.
 * This module does exactly that — it's the "so what do I actually fix" layer on top of both
 * the SEO/AXO audit and the GEO visibility test.
 */

function normalizeForMatch(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "")).toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export async function auditPagesForGap(urls: string[]): Promise<SeoAuditResult[]> {
  return Promise.all(urls.map((u) => runSeoAudit(u)));
}

export function buildGapMatrix(audits: SeoAuditResult[], runs: GeoRunResult[]): GapRow[] {
  return audits.map((audit) => {
    const pageKey = normalizeForMatch(audit.url);
    const pageDomain = domainOf(audit.url);

    let citedExact = 0;
    let citedDomain = 0;
    for (const run of runs) {
      for (const c of run.citations) {
        if (c.domain === pageDomain) citedDomain++;
        if (normalizeForMatch(c.url) === pageKey) citedExact++;
      }
    }

    const blockedBots = audit.meta.aiBotAccess.filter((b) => !b.allowed).length;

    let verdict: GapRow["verdict"];
    if (blockedBots > 0) verdict = "blocked";
    else if (citedExact > 0) verdict = "cited";
    else if (audit.score >= 60 && audit.aiCrawlScore >= 60) verdict = "invisible";
    else verdict = "needs-work";

    return {
      url: audit.url,
      seoScore: audit.score,
      aiCrawlScore: audit.aiCrawlScore,
      blockedBots,
      citedExact,
      citedDomain,
      verdict,
    };
  });
}
