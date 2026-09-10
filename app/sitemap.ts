import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// All of these are reachable with no login (open-access/demo mode — see lib/auth.ts's
// isOpenAccessEnabled), so they're all real, crawlable pages worth listing. /login is
// left out — an auth form has no indexable content of its own.
const TOOL_PAGES = [
  "/audit",
  "/geo",
  "/gap",
  "/article-writer",
  "/monitor",
  "/import",
  "/content",
  "/local",
  "/clients",
  "/prompts",
];

const FEATURE_PAGES = [
  "/features/seo-axo-audit",
  "/features/geo-visibility",
  "/features/gap-analysis",
  "/features/axo-monitoring",
  "/features/bulk-import",
  "/features/content-studio",
  "/features/clients",
  "/features/claude-code-prompts",
];

const OTHER_PAGES = ["/", "/pricing", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries = [
    ...OTHER_PAGES.map((path) => ({ path, priority: path === "/" ? 1 : 0.5 })),
    ...TOOL_PAGES.map((path) => ({ path, priority: 0.9 })),
    ...FEATURE_PAGES.map((path) => ({ path, priority: 0.7 })),
  ];

  return entries.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    priority,
  }));
}
