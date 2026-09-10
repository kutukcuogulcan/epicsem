// Single source of truth for the site's public URL — used by robots.ts, sitemap.ts,
// and the JSON-LD structured data. Falls back to the current Render URL so nothing
// breaks before a custom domain is set; once one is, set NEXT_PUBLIC_SITE_URL and
// every generated URL (sitemap, robots, schema) follows automatically.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://epicsem-web.onrender.com";

export const SITE_NAME = "Epicsem";
// Deliberately a placeholder, not a real address — this project's policy (see
// components/Footer.tsx) is to never fabricate legal/company details on public pages.
// Replace with a real support/contact address before treating /privacy or /terms as final.
export const CONTACT_EMAIL = "destek@epicsem.com";
