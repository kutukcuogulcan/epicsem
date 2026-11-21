import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { getGeoOpportunities, getLatestAuditForHost, saveGeoOpportunities } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";
import { runAuditAgent, type AuditAgentReport } from "@/lib/audit-agent";
import { quotaExceededMessage, refundQuota, reserveQuota } from "@/lib/usage-guard";
import { hostOf } from "@/lib/agent-tools";

export const maxDuration = 300;
const AGENT_QUERIES = 5;
// Rapor tablosunu paylaşır; anahtar "audit:<denetim zamanı>".
const keyOf = (at: string) => `audit:${at}`;

async function latest(userId: number, url: string) {
  const host = hostOf(/^https?:\/\//.test(url) ? url : `https://${url}`);
  return host ? { host, audit: await getLatestAuditForHost(userId, host) } : null;
}

/** GET ?url= → bu sitenin son denetimi için kayıtlı agent raporu (yoksa null). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const l = await latest(user.id, req.nextUrl.searchParams.get("url") ?? "");
  if (!l?.audit) return NextResponse.json({ report: null });
  return NextResponse.json({ report: await getGeoOpportunities<AuditAgentReport>(user.id, l.host, keyOf(l.audit.createdAt)) });
}

/** POST {url} → Site Denetimi agent'ı (Claude; sayfaları ve rakibi denetler; 5 AI sorgusu). */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const { url } = await req.json().catch(() => ({}));
  const l = await latest(user.id, typeof url === "string" ? url : "");
  if (!l?.audit) return NextResponse.json({ error: "Önce bu siteyi denetle." }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Denetim agent'ı için Claude (Anthropic) anahtarı gerekli — Entegrasyonlar'dan ekle." }, { status: 400 });
  const lim = rateLimit(`audit-agent:${user.id}`, 5, 60 * 60 * 1000);
  if (!lim.allowed) return NextResponse.json({ error: "Saatte en fazla 5 agent analizi." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(lim.resetAt)) } });
  const q = await reserveQuota(user.id, "engineQueries", AGENT_QUERIES);
  if (!q.allowed) return NextResponse.json({ error: quotaExceededMessage("engineQueries", q, AGENT_QUERIES) }, { status: 402 });
  try {
    const p = await getActiveProject(user.id, l.host).catch(() => null);
    const brand = { name: p?.name || l.host.split(".")[0], domain: l.host };
    const report = await runAuditAgent(user.id, l.audit.result, brand, (p?.competitors ?? []).filter((c) => c.name && c.domain).slice(0, 5));
    await saveGeoOpportunities(user.id, l.host, keyOf(l.audit.createdAt), report);
    return NextResponse.json({ report });
  } catch (e) {
    await refundQuota(user.id, "engineQueries", AGENT_QUERIES).catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "Analiz yapılamadı" }, { status: 500 });
  }
}
