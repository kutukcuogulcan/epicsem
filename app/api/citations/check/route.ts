import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { listCitationStatus, setCitationStatus } from "@/lib/db";
import { rootHost } from "@/lib/backlinks";

/**
 * POST { site, dirId? } — profil sayfasında sitene link var mı? Sayfayı çekip site adresini arar.
 * Facebook, Instagram, Google gibi giriş/JS isteyen sayfalar doğrulanamaz (null döner).
 */
/** Giriş/JS duvarı olan sayfalar: dışarıdan çekilince link görünmez, yanlış "link yok" demeyelim. */
const NOT_VERIFIABLE = new Set(["facebook", "instagram", "linkedin", "x", "google-business", "apple-business", "yandex-business", "bing-places", "google-merchant", "youtube"]);

async function hasLink(listingUrl: string, host: string): Promise<boolean | null> {
  try {
    const r = await fetch(listingUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; EpicsemLinkCheck/1.0)", "Accept-Language": "tr,en;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const html = (await r.text()).toLowerCase();
    if (html.length < 200) return null;
    const h = host.toLowerCase().replace(/\./g, "\\.");
    return new RegExp(`(https?:)?(//|%2f%2f)(www\\.)?${h}|["'\\s>](www\\.)?${h}[/"'<\\s]`).test(html);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`citation-check:${user.id}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatlik kontrol sınırına ulaştın." }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const site = rootHost(String(b.site ?? ""));
  if (!site) return NextResponse.json({ error: "Site gerekli." }, { status: 400 });
  const rows = (await listCitationStatus(user.id, site)).filter((r) => r.listingUrl && (!b.dirId || r.dirId === b.dirId)).slice(0, 30);
  const results: { dirId: string; linkFound: boolean | null }[] = [];
  for (let i = 0; i < rows.length; i += 5) {
    await Promise.all(
      rows.slice(i, i + 5).map(async (r) => {
        const found = NOT_VERIFIABLE.has(r.dirId) ? null : await hasLink(r.listingUrl!, site);
        await setCitationStatus(user.id, site, r.dirId, { linkFound: found, checked: true, ...(found === true && r.status !== "live" ? { status: "live" } : {}) });
        results.push({ dirId: r.dirId, linkFound: found });
      })
    );
  }
  return NextResponse.json({ results });
}
