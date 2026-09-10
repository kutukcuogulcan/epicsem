import type { MetadataRoute } from "next";
import { AI_BOTS } from "@/lib/ai-bots";
import { SITE_URL } from "@/lib/site";

// This app audits OTHER sites for exactly this file — it would be a bad look (and bad
// for its own AI/AEO visibility) to ship with no robots.txt of its own. Explicitly
// allows every AI crawler in lib/ai-bots.ts (the same list /audit and /monitor check),
// since a GEO/AEO tool wants to be citable by the engines it measures visibility in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
      ...AI_BOTS.map((bot) => ({ userAgent: bot.userAgent, allow: "/" })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
