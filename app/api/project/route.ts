import { NextRequest, NextResponse } from "next/server";
import { autofillCompetitors, saveVerifiedAliases } from "@/lib/competitor-autofill";
import { isDemoMode } from "@/lib/geo-providers";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient, getClient, listClients, listKnownSites, updateClient, type Client } from "@/lib/db";
import { readableZodError } from "@/lib/zod-error";

/**
 * Aktif proje — sol menünün altındaki seçici. Proje = Müşteriler tablosundaki kayıt (site, marka, rakipler).
 * Seçim tarayıcı başına çerezde tutulur (paylaşılan demo hesabında kullanıcılar birbirini etkilemesin).
 *
 * GET  → { active, projects, suggestions }  (suggestions: verisi olup projesi olmayan siteler)
 * PUT  { id }  → aktif projeyi değiştir (id: null → seçimi kaldır)
 * POST { name, domain, competitors? } → yeni proje oluştur ve aktif yap
 * PATCH { id, name?, domain?, competitors? } → projeyi düzenle
 */
const COOKIE = "epicsem_project";
const norm = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");

export interface Project {
  id: number;
  name: string;
  domain: string;
  competitors: { name: string; domain: string }[];
  aliases: string[];
}
const toProject = (c: Client): Project => ({ id: c.id, name: c.name, domain: norm(c.domain), competitors: c.competitors, aliases: c.aliases ?? [] });

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  try {
    const [clients, sites] = await Promise.all([listClients(user.id), listKnownSites(user.id)]);
    const projects = clients.map(toProject);
    const jar = await cookies();
    const id = Number(jar.get(COOKIE)?.value);
    let active = projects.find((p) => p.id === id) ?? null;
    // Seçim yoksa ilk projeyi aktif say (kullanıcı hiç seçmediyse menü boş kalmasın).
    if (!active && projects.length) active = projects[0];
    const have = new Set(projects.map((p) => p.domain));
    const suggestions = sites
      .map(norm)
      .filter((s) => s && s.includes(".") && !/^(localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(s) && !have.has(s))
      .slice(0, 8);
    return NextResponse.json({ active, projects, suggestions });
  } catch (e) {
    console.error("[api/project] GET failed:", e);
    return NextResponse.json({ error: "Projeler alınamadı." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const jar = await cookies();
  if (b.id == null) {
    jar.delete(COOKIE);
    return NextResponse.json({ active: null });
  }
  const c = await getClient(user.id, Number(b.id));
  if (!c) return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
  jar.set(COOKIE, String(c.id), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return NextResponse.json({ active: toProject(c) });
}

const brand = z.object({ name: z.string().trim().min(1).max(80), domain: z.string().trim().min(3).max(120) });
const createSchema = z.object({ name: z.string().trim().min(1).max(80), domain: z.string().trim().min(3).max(120), competitors: z.array(brand).max(8).default([]), ownBrands: z.array(z.string().trim().max(60)).max(15).optional() });

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  let p;
  try {
    p = createSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: readableZodError(e) }, { status: 400 });
  }
  try {
    // Aynı site zaten bir projeyse yenisini açma, onu seç.
    const existing = (await listClients(user.id)).find((x) => norm(x.domain) === norm(p.domain));
    if (existing) {
      (await cookies()).set(COOKIE, String(existing.id), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
      return NextResponse.json({ active: toProject(existing), existed: true });
    }
    const c = await createClient(user.id, { name: p.name, domain: norm(p.domain), competitors: p.competitors.map((x) => ({ name: x.name, domain: norm(x.domain) })) });
    (await cookies()).set(COOKIE, String(c.id), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    // Rakipsiz açılan projeye rakipleri arka planda yaz (sunucu sürekli çalışıyor; cevabı bekletmez).
    if (!c.competitors.length && !isDemoMode()) void autofillCompetitors(user.id, c.id, norm(p.domain));
    // Kurulum sihirbazının rakip adımından gelen alt marka adayları: siteyle doğrulanıp yazılır (AI çağrısı yok).
    else if (p.ownBrands?.length) void saveVerifiedAliases(user.id, c.id, norm(p.domain), p.ownBrands);
    return NextResponse.json({ active: toProject(c) });
  } catch (e) {
    console.error("[api/project] POST failed:", e);
    return NextResponse.json({ error: "Proje oluşturulamadı." }, { status: 500 });
  }
}

const patchSchema = createSchema.partial().extend({ id: z.number(), aliases: z.array(z.string().trim().min(2).max(60)).max(12).optional() });

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  let p;
  try {
    p = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: readableZodError(e) }, { status: 400 });
  }
  const c = await updateClient(user.id, p.id, {
    name: p.name,
    domain: p.domain ? norm(p.domain) : undefined,
    competitors: p.competitors?.map((x) => ({ name: x.name, domain: norm(x.domain) })),
    aliases: p.aliases ? [...new Set(p.aliases.filter((a) => a.toLocaleLowerCase("tr") !== (p.name ?? "").toLocaleLowerCase("tr")))] : undefined,
  });
  if (!c) return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
  return NextResponse.json({ active: toProject(c) });
}
