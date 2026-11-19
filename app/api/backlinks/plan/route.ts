import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getBacklinkCache, getIntegration, setBacklinkCache } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { sitePagesForLinks } from "@/lib/article-enrich";
import { rootHost } from "@/lib/backlinks";
import { ASSET_LABEL, assetType, competitorProfile, type AssetType, type CompetitorLinkProfile, type LinkIdea } from "@/lib/link-plan";
import { brandContextFor, QuotaError, runSmallAiJson, str } from "@/lib/ai-small";
import { isDemoMode } from "@/lib/geo-providers";
import { readableZodError } from "@/lib/zod-error";

export const maxDuration = 120;

const schema = z.object({
  site: z.string().trim().max(120).optional(),
  competitors: z.array(z.string().trim().max(120)).max(4).optional(),
  refresh: z.boolean().optional(),
});

export interface LinkPlan {
  site: string;
  competitors: CompetitorLinkProfile[];
  ownPages: number;
  ownTypes: Partial<Record<AssetType, number>>;
  ideas: LinkIdea[];
  demo?: boolean;
  generatedAt: string;
}

/**
 * POST /api/backlinks/plan — Link kazanma planı. Rakip analizi ücretsiz kaynaklarla (+ Ahrefs bağlıysa);
 * yazı önerileri 1 AI sorgusu. Sonuç 24 saat önbellekte (yeniden açmak ücretsiz).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  let b: z.infer<typeof schema>;
  try {
    b = schema.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json({ error: readableZodError(e) }, { status: 400 });
  }
  const project = await getActiveProject(user.id).catch(() => null);
  const site = rootHost(b.site || project?.domain || "");
  if (!site) return NextResponse.json({ error: "Önce bir proje seç ya da site yaz." }, { status: 400 });
  const comps = (b.competitors?.length ? b.competitors : (project?.competitors ?? []).map((c) => c.domain)).map(rootHost).filter((c) => c && c !== site).slice(0, 4);
  if (!comps.length) return NextResponse.json({ error: "Rakip bulunamadı. Proje Ayarları'na en az bir rakip ekle.", needsCompetitors: true }, { status: 400 });

  const key = `plan2:${site}:${[...comps].sort().join(",")}`;
  if (!b.refresh) {
    const c = await getBacklinkCache<LinkPlan>(user.id, key, 24 * 7);
    if (c) return NextResponse.json({ plan: c.data, cachedAt: c.createdAt });
  }
  const rl = rateLimit(`link-plan:${user.id}`, 6, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatte en fazla 6 plan çıkarılabilir." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rl.resetAt)) } });

  const ahrefsKey = (await getIntegration(user.id, "ahrefs").catch(() => null))?.secrets.apiKey ?? null;
  const [profiles, own] = await Promise.all([
    Promise.all(comps.map((c) => competitorProfile(user.id, c, ahrefsKey, project?.competitors?.find((x) => rootHost(x.domain) === c)?.name))),
    sitePagesForLinks(user.id, site, 200).catch(() => [] as { title: string; url: string }[]),
  ]);
  const ownTypes: Partial<Record<AssetType, number>> = {};
  for (const p of own) {
    const t = assetType(`${p.url} ${p.title}`);
    ownTypes[t] = (ownTypes[t] ?? 0) + 1;
  }
  const linkers = [...new Map(profiles.flatMap((p) => p.refDomains.map((r) => [r.domain, r] as const))).values()].filter((r) => r.domain !== site).slice(0, 60);
  const brandName = project?.name ?? site.split(".")[0];

  let ideas: LinkIdea[] = [];
  let demo = false;
  if (isDemoMode()) {
    demo = true;
    const tops = profiles.flatMap((p) => p.samplePages.map((s) => ({ ...s, comp: p.domain }))).slice(0, 5);
    ideas = (tops.length ? tops : [{ url: "", title: `${brandName} rehberi`, type: "guide" as AssetType, comp: comps[0] }]).map((t) => ({
      title: `[Demo] ${t.title || ASSET_LABEL[t.type]}`,
      type: t.type,
      targetKeyword: t.title || brandName,
      why: "Demo mod: gerçek anahtar tanımlanınca rakip verisinden siteye özel öneri yazılır.",
      outline: ["Tanım", "Adım adım", "Karşılaştırma tablosu", "SSS"],
      anchors: { exact: t.title || brandName, partial: [`${t.title} rehberi`], branded: brandName, generic: "bu rehber" },
      pitchTo: linkers.slice(0, 3).map((l) => l.domain),
      internalFrom: own.slice(0, 2).map((o) => ({ url: o.url, anchor: t.title || brandName })),
      inspiredBy: t.url || null,
    }));
  } else {
    const compBlock = profiles
      .map(
        (p) =>
          `RAKİP ${p.domain}: ${p.pages} sayfa. İçerik türleri: ${Object.entries(p.types).map(([k, v]) => `${ASSET_LABEL[k as AssetType]} ${v}`).join(", ") || "—"}.
  Link alan sayfaları: ${p.topPages.map((t) => `${t.url} (${t.linkers.length} site)`).join("; ") || "veri yok"}.
  Örnek içerikleri: ${p.samplePages.slice(0, 15).map((s) => s.title).join(" | ") || "—"}`
      )
      .join("\n");
    const ctx = await brandContextFor(user.id, site);
    const prompt = `Sen kıdemli bir SEO ve link building (backlink) stratejistisin. ${brandName} (${site}) için "link kazandıracak" 5 yazı öner.
KURALLAR: Yalnızca aşağıdaki veriye dayan. Link istenecek siteleri (pitchTo) SADECE "LİNK VEREN SİTELER" listesinden seç; liste boşsa boş dizi döndür. İçeriden link verecek sayfaları (internalFrom.url) SADECE "SİTENİN SAYFALARI" listesinden seç. Rakam ya da site uydurma. Türkçe yaz.
Link çeken içerik türleri: istatistik/araştırma derlemesi, kapsamlı rehber, ücretsiz araç/hesaplama, şablon/kontrol listesi, karşılaştırma, sözlük. Rakiplerde link alan türleri ve sitede EKSİK olan türleri önceliklendir.
Anchor text planı (basit SEO mantığı): exact = hedef kelimenin kendisi (az kullanılır), partial = kelimeyi içeren 2-3 doğal ifade, branded = marka adı, generic = "bu rehber" gibi.
${ctx}
${compBlock}
SİTENİN İÇERİK TÜRLERİ: ${Object.entries(ownTypes).map(([k, v]) => `${ASSET_LABEL[k as AssetType]} ${v}`).join(", ") || "veri yok"}
SİTENİN SAYFALARI: ${own.slice(0, 40).map((o) => `${o.title} → ${o.url}`).join(" | ") || "(yok)"}
LİNK VEREN SİTELER (rakiplere): ${linkers.map((l) => l.domain).join(", ") || "(yok)"}

Yalnızca şu JSON'u döndür:
{"ideas":[{"title":"yazı başlığı","type":"guide|listicle|comparison|stats|tool|glossary|template|case","targetKeyword":"hedef anahtar kelime","why":"1-2 cümle: neden link çeker, hangi rakip içeriğine karşılık","outline":["H2","H2","H2","H2"],"anchors":{"exact":"","partial":["",""],"branded":"","generic":""},"pitchTo":["domain"],"internalFrom":[{"url":"","anchor":""}],"inspiredBy":"rakip URL ya da null"}]}`;
    try {
      const p = await runSmallAiJson(user.id, prompt);
      const allowed = new Set(linkers.map((l) => l.domain));
      const ownUrls = new Set(own.map((o) => o.url));
      const TYPES = Object.keys(ASSET_LABEL);
      ideas = (Array.isArray(p.ideas) ? p.ideas : []).slice(0, 6).map((x: any) => ({
        title: str(x?.title, 140) ?? "",
        type: (TYPES.includes(x?.type) ? x.type : "guide") as AssetType,
        targetKeyword: str(x?.targetKeyword, 80) ?? "",
        why: str(x?.why, 400) ?? "",
        outline: (Array.isArray(x?.outline) ? x.outline : []).map((h: unknown) => str(h, 120)).filter(Boolean).slice(0, 8) as string[],
        anchors: {
          exact: str(x?.anchors?.exact, 80) ?? str(x?.targetKeyword, 80) ?? "",
          partial: (Array.isArray(x?.anchors?.partial) ? x.anchors.partial : []).map((a: unknown) => str(a, 80)).filter(Boolean).slice(0, 3) as string[],
          branded: str(x?.anchors?.branded, 60) ?? brandName,
          generic: str(x?.anchors?.generic, 60) ?? "bu rehber",
        },
        pitchTo: (Array.isArray(x?.pitchTo) ? x.pitchTo : []).map((d: unknown) => rootHost(String(d))).filter((d: string) => allowed.has(d)).slice(0, 6),
        internalFrom: (Array.isArray(x?.internalFrom) ? x.internalFrom : [])
          .map((i: any) => ({ url: String(i?.url ?? ""), anchor: str(i?.anchor, 80) ?? "" }))
          .filter((i: { url: string; anchor: string }) => ownUrls.has(i.url) && i.anchor)
          .slice(0, 4),
        inspiredBy: str(x?.inspiredBy, 300),
      })).filter((i: LinkIdea) => i.title && i.targetKeyword);
    } catch (e) {
      if (e instanceof QuotaError) return NextResponse.json({ error: e.message }, { status: 402 });
      return NextResponse.json({ error: e instanceof Error ? e.message : "Plan çıkarılamadı" }, { status: 500 });
    }
  }
  const plan: LinkPlan = { site, competitors: profiles, ownPages: own.length, ownTypes, ideas, demo, generatedAt: new Date().toISOString() };
  await setBacklinkCache(user.id, key, plan).catch(() => {});
  return NextResponse.json({ plan, cachedAt: plan.generatedAt });
}

/** GET /api/backlinks/plan?site= — önbellekteki son plan (ücretsiz; yoksa plan: null). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ plan: null });
  const project = await getActiveProject(user.id).catch(() => null);
  const site = rootHost(req.nextUrl.searchParams.get("site") || project?.domain || "");
  const comps = (project?.competitors ?? []).map((c) => rootHost(c.domain)).filter((c) => c && c !== site).slice(0, 4);
  if (!site || !comps.length) return NextResponse.json({ plan: null });
  const c = await getBacklinkCache<LinkPlan>(user.id, `plan2:${site}:${[...comps].sort().join(",")}`, 24 * 7);
  return NextResponse.json({ plan: c?.data ?? null, cachedAt: c?.createdAt ?? null });
}
