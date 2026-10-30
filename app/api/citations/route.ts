import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCitationProfile, listCitationStatus, saveCitationProfile, setCitationStatus } from "@/lib/db";
import { dirById } from "@/lib/citation-directories";
import { rootHost } from "@/lib/backlinks";

const STATUSES = new Set(["todo", "sent", "live", "skip"]);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** GET ?site= → profil + kayıt durumları · PUT { site, profile } · POST { site, dirId, status?, listingUrl? } */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const site = rootHost(req.nextUrl.searchParams.get("site") ?? "");
  if (!site) return NextResponse.json({ error: "Site gerekli." }, { status: 400 });
  const [profile, statuses] = await Promise.all([getCitationProfile(user.id, site), listCitationStatus(user.id, site)]);
  return NextResponse.json({ site, profile, statuses });
}

export async function PUT(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const site = rootHost(str(b.site, 200));
  if (!site) return NextResponse.json({ error: "Site gerekli." }, { status: 400 });
  const cur = await getCitationProfile(user.id, site);
  const p = b.profile ?? {};
  await saveCitationProfile(user.id, site, {
    ...cur,
    bizType: ["local", "ecommerce", "service", "saas"].includes(p.bizType) ? p.bizType : cur.bizType ?? "ecommerce",
    name: str(p.name, 120),
    address: str(p.address, 300),
    phone: str(p.phone, 40),
    email: str(p.email, 120),
    category: str(p.category, 120),
    description: str(p.description, 1000),
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const site = rootHost(str(b.site, 200));
  const dir = dirById(str(b.dirId, 60));
  if (!site || !dir) return NextResponse.json({ error: "Geçersiz kayıt." }, { status: 400 });
  const status = STATUSES.has(b.status) ? b.status : undefined;
  let listingUrl: string | null | undefined = undefined;
  if (b.listingUrl !== undefined) {
    const u = str(b.listingUrl, 500);
    if (u && !/^https?:\/\//i.test(u)) return NextResponse.json({ error: "Profil adresi https:// ile başlamalı." }, { status: 400 });
    listingUrl = u || null;
  }
  await setCitationStatus(user.id, site, dir.id, { status, listingUrl, ...(listingUrl !== undefined ? { linkFound: null } : {}) });
  return NextResponse.json({ ok: true });
}
