import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { z } from "zod";
import { runSeoAudit } from "@/lib/seo-audit";
import { privateIp } from "@/lib/safe-fetch";
import { getClientIp, rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { insightFor } from "@/lib/audit-insights";
import type { SeoAuditResult } from "@/types";

export const maxDuration = 60;

/**
 * POST /api/free-check — giriş gerektirmeyen ücretsiz "AI görünürlüğüne hazır mı?" testi.
 * Sitenin ana sayfasında kural tabanlı kontroller (AI botları, llms.txt, yapısal veri, cevap-önce,
 * meta, sitemap, yazar/tarih, içerik derinliği). AI KULLANMAZ. IP başına saatte 5 test; alan adı başına 6 saat önbellek.
 */

const schema = z.object({ url: z.string().trim().min(4).max(200) });

export interface FreeCheckItem {
  key: string;
  label: string;
  ok: boolean;
  partial?: boolean;
  detail: string;
  weight: number;
}
export interface FreeCheckResult {
  host: string;
  score: number;
  items: FreeCheckItem[];
  fixes: { title: string; why: string }[];
  checkedAt: string;
}

const cache = new Map<string, { at: number; r: FreeCheckResult }>();


function summarize(host: string, r: SeoAuditResult): FreeCheckResult {
  const find = (re: RegExp) => r.issues.find((i) => re.test(i.title));
  const bots = r.meta.aiBotAccess;
  const citation = bots.filter((b) => b.role !== "training");
  const blocked = citation.filter((b) => !b.allowed);
  const items: FreeCheckItem[] = [
    { key: "bots", label: "AI arama botları siteye girebiliyor", ok: !blocked.length, detail: blocked.length ? `${blocked.length} bot engelli: ${blocked.slice(0, 4).map((b) => b.bot).join(", ")}` : `${citation.length} AI arama/alıntı botunun hepsi izinli`, weight: 25 },
    { key: "schema", label: "Yapısal veri (JSON-LD)", ok: r.meta.hasSchema && !find(/could not be parsed|incomplete/), partial: r.meta.hasSchema && !!find(/could not be parsed|incomplete/), detail: r.meta.hasSchema ? `Bulunan: ${r.meta.schemaTypes.slice(0, 5).join(", ")}${find(/incomplete/) ? " · bazı alanlar eksik" : ""}` : "Hiç JSON-LD yok", weight: 15 },
    { key: "answer", label: "Sayfa doğrudan cevapla başlıyor", ok: !find(/direct answer/), detail: find(/direct answer/) ? "İlk paragrafta net bir tanım/cevap cümlesi yok" : "İlk paragraf net bir cevap veriyor", weight: 12 },
    { key: "llms", label: "llms.txt dosyası", ok: !!r.meta.llmsTxt, detail: r.meta.llmsTxt ? "Bulundu" : "Yok — LLM'ler için site haritası", weight: 8 },
    { key: "meta", label: "Title ve meta açıklama", ok: !!r.meta.title && !!r.meta.description, partial: !!r.meta.title !== !!r.meta.description, detail: `${r.meta.title ? "Title var" : "Title yok"} · ${r.meta.description ? "meta açıklama var" : "meta açıklama yok"}`, weight: 10 },
    { key: "sitemap", label: "Site haritası", ok: !!r.meta.sitemap?.url && !r.meta.sitemap.broken.length, partial: !!r.meta.sitemap?.url && !!r.meta.sitemap.broken.length, detail: r.meta.sitemap?.url ? `${r.meta.sitemap.urls.toLocaleString("tr-TR")} adres${r.meta.sitemap.broken.length ? ` · ${r.meta.sitemap.broken.length} kırık` : ""}` : "Bulunamadı", weight: 10 },
    { key: "eeat", label: "Güven sinyalleri (yazar, tarih, Hakkımızda)", ok: !find(/No author|No published|About\/Contact/), partial: !!find(/No author|No published|About\/Contact/) && !(find(/No author/) && find(/No published/)), detail: [find(/No author/) && "yazar yok", find(/No published/) && "tarih yok", find(/About\/Contact/) && "Hakkımızda/İletişim linki yok"].filter(Boolean).join(" · ") || "Tamam", weight: 10 },
    { key: "depth", label: "İçerik derinliği", ok: r.meta.wordCount >= 300, partial: r.meta.wordCount >= 150 && r.meta.wordCount < 300, detail: `~${r.meta.wordCount} kelime görünür metin`, weight: 10 },
  ];
  const score = Math.round(items.reduce((s, i) => s + (i.ok ? i.weight : i.partial ? i.weight / 2 : 0), 0));
  const fixes = r.issues
    .filter((i) => i.severity !== "pass")
    .map((i) => insightFor(i, r))
    .sort((a, b) => Number(b.geo) - Number(a.geo) || b.impact - a.impact)
    .slice(0, 3)
    .map((x) => ({ title: x.title, why: x.why || x.recommendation }));
  return { host, score, items, fixes, checkedAt: new Date().toISOString() };
}

export async function POST(req: NextRequest) {
  let b: z.infer<typeof schema>;
  try {
    b = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Geçerli bir site adresi yaz (ör. siteniz.com)." }, { status: 400 });
  }
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(b.url) ? b.url : `https://${b.url}`);
  } catch {
    return NextResponse.json({ error: "Geçerli bir site adresi yaz (ör. siteniz.com)." }, { status: 400 });
  }
  const host = u.hostname.toLowerCase().replace(/^www\./i, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || u.port) return NextResponse.json({ error: "Yalnızca herkese açık alan adları test edilebilir." }, { status: 400 });

  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return NextResponse.json({ result: hit.r, cached: true });

  const lim = rateLimit(`free-check:${getClientIp(req)}`, 5, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatte en fazla 5 test yapılabilir. Ücretsiz hesap açarak sınırsız denetim yapabilirsin." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });

  try {
    const addrs = await lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) return NextResponse.json({ error: "Bu adres test edilemez." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Alan adı bulunamadı. Yazımı kontrol et." }, { status: 400 });
  }

  try {
    const r = await runSeoAudit(`https://${u.hostname}/`);
    if (!r.score && r.issues.some((i) => /could not be fetched|returned HTTP/.test(i.title))) {
      return NextResponse.json({ error: "Site açılamadı ya da botlara kapalı. Adresi kontrol edip tekrar dene." }, { status: 502 });
    }
    const result = summarize(host, r);
    cache.set(host, { at: Date.now(), r: result });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json({ error: "Test tamamlanamadı, birazdan tekrar dene." }, { status: 500 });
  }
}
