import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getBacklinkCache, saveClientSettings, setBacklinkCache } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { rootHost } from "@/lib/backlinks";
import { SECTOR_BY_ID, guessSector } from "@/lib/sector-sources";
import { communitySearchAvailable, siteMentions } from "@/lib/community-search";
import { checkQuota, consumeQuota, quotaExceededMessage } from "@/lib/usage-guard";
import { readableZodError } from "@/lib/zod-error";

export const maxDuration = 180;

/** Bir markanın sektör sitelerindeki görünürlüğü: host → bulunan sayfalar. */
export interface SectorPresence {
  sector: string;
  brands: { name: string; domain: string; own: boolean }[];
  /** host → marka adı → sayfa adresleri (en fazla 3). */
  presence: Record<string, Record<string, string[]>>;
  checkedAt: string;
}

const cacheKey = (site: string, sector: string, brands: string[]) => `sector1:${site}:${sector}:${brands.map((b) => b.toLowerCase()).sort().join(",")}`;

async function context(userId: number) {
  const project = await getActiveProject(userId).catch(() => null);
  if (!project) return null;
  const site = rootHost(project.domain);
  const brands = [
    { name: project.name || site.split(".")[0], domain: site, own: true },
    ...(project.competitors ?? []).slice(0, 3).map((c) => ({ name: c.name, domain: rootHost(c.domain), own: false })),
  ];
  const saved = project.settings?.sector && SECTOR_BY_ID[project.settings.sector] ? project.settings.sector : null;
  const guessed = saved ? null : guessSector(`${project.settings?.description ?? ""} ${project.settings?.products ?? ""} ${project.name}`);
  return { project, site, brands, sector: saved ?? guessed, guessed: !saved && Boolean(guessed) };
}

/** GET → seçili (ya da tahmin edilen) sektör + önbellekteki tarama sonucu (ücretsiz). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const ctx = await context(user.id);
  if (!ctx) return NextResponse.json({ error: "Önce bir proje seç." }, { status: 400 });
  const cached = ctx.sector ? await getBacklinkCache<SectorPresence>(user.id, cacheKey(ctx.site, ctx.sector, ctx.brands.map((b) => b.name)), 24 * 7) : null;
  return NextResponse.json({ site: ctx.site, sector: ctx.sector, guessed: ctx.guessed, brands: ctx.brands, result: cached?.data ?? null, cachedAt: cached?.createdAt ?? null, searchAvailable: communitySearchAvailable() });
}

const schema = z.object({ sector: z.string().max(40), scan: z.boolean().optional() });

/** POST { sector, scan? } → sektörü projeye kaydeder; scan=true ise sen + rakipler için sektör sitelerini tarar. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  let b: z.infer<typeof schema>;
  try {
    b = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: readableZodError(e) }, { status: 400 });
  }
  const sector = SECTOR_BY_ID[b.sector];
  if (!sector) return NextResponse.json({ error: "Bilinmeyen sektör." }, { status: 400 });
  const ctx = await context(user.id);
  if (!ctx) return NextResponse.json({ error: "Önce bir proje seç." }, { status: 400 });
  if (ctx.project.settings?.sector !== sector.id) await saveClientSettings(user.id, ctx.project.id, { ...(ctx.project.settings ?? {}), sector: sector.id });
  if (!b.scan) return NextResponse.json({ sector: sector.id });

  if (!communitySearchAvailable()) return NextResponse.json({ error: "Tarama için Gemini (Google AI) anahtarı gerekiyor. Entegrasyonlar'dan ya da Render'da GOOGLE_AI_API_KEY ile ekle." }, { status: 400 });
  const rl = rateLimit(`sector-scan:${user.id}`, 4, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatte en fazla 4 sektör taraması yapılabilir." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } });

  // Her marka için siteler 6'lık gruplarla aranır (tek sorguda çok site olunca Google bazılarını atlıyor).
  const hosts = [...new Set(sector.sources.map((s) => s.host))];
  const groups: string[][] = [];
  for (let i = 0; i < hosts.length; i += 6) groups.push(hosts.slice(i, i + 6));
  const cost = ctx.brands.length;
  const q = await checkQuota(user.id, "engineQueries", cost);
  if (!q.allowed) return NextResponse.json({ error: quotaExceededMessage("engineQueries", q, cost) }, { status: 402 });

  const jobs = ctx.brands.flatMap((br) => groups.map((g) => ({ br, g })));
  const presence: SectorPresence["presence"] = {};
  for (const h of hosts) presence[h] = {};
  // En fazla 6 eşzamanlı arama.
  for (let i = 0; i < jobs.length; i += 6) {
    const batch = jobs.slice(i, i + 6);
    const res = await Promise.all(batch.map((j) => siteMentions(j.br.name, j.g, j.br.domain).catch(() => [])));
    res.forEach((list, k) => {
      const name = batch[k].br.name;
      for (const m of list) {
        const arr = (presence[m.host][name] ??= []);
        if (arr.length < 3 && !arr.includes(m.url)) arr.push(m.url);
      }
    });
  }
  await consumeQuota(user.id, "engineQueries", cost).catch(() => {});
  const result: SectorPresence = { sector: sector.id, brands: ctx.brands, presence, checkedAt: new Date().toISOString() };
  await setBacklinkCache(user.id, cacheKey(ctx.site, sector.id, ctx.brands.map((x) => x.name)), result);
  return NextResponse.json({ result, cachedAt: result.checkedAt });
}
