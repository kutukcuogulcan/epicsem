import { getGeoRunForCompare, getLatestGeoRunFull } from "@/lib/db";
import { diffRuns, type RunDiff } from "@/lib/geo-diff";
import { toCells } from "@/lib/geo-change";
import { getActiveProject } from "@/lib/project-context";
import { buildGeoReport, type GeoReport } from "@/lib/geo-report";

export interface ReportData {
  report: GeoReport;
  brand: string;
  domain: string;
  createdAt: string;
  demo: boolean;
  prevAt: string | null;
  diff: RunDiff | null;
  /** Kaybedilen ilk sorulardan, markanın anılmadığı cevap alıntıları (AI özeti için). */
  excerpts: string[];
}

/** Aktif projenin son GEO testi: kodla rapor + önceki testle fark (rakipler/alt markalar proje ayarından). */
export async function loadReportData(userId: number): Promise<ReportData | null> {
  const p = await getActiveProject(userId);
  const geo = p ? ((await getLatestGeoRunFull(userId, p.domain)) ?? (await getLatestGeoRunFull(userId, `www.${p.domain}`))) : await getLatestGeoRunFull(userId);
  if (!geo) return null;
  const own = { name: geo.brand.name, domain: geo.brand.domain, aliases: p?.aliases ?? [] };
  const rivals = p?.competitors.length ? p.competitors : geo.competitors;
  const prev = await getGeoRunForCompare(userId, geo.brand.domain, geo.createdAt);
  const diff = prev ? diffRuns(toCells(prev.runs, own, rivals), toCells(geo.runs, own, rivals)) : null;
  const report = buildGeoReport(geo.runs, own, rivals);
  const excerpts = report.lost
    .slice(0, 3)
    .map((q) => geo.runs.find((r) => r.promptText === q.question && !r.mentioned)?.responseText ?? "")
    .filter(Boolean)
    .map((t) => t.replace(/\s+/g, " ").slice(0, 300));
  return { report, brand: own.name, domain: geo.brand.domain, createdAt: geo.createdAt, demo: geo.demoMode, prevAt: prev?.createdAt ?? null, diff, excerpts };
}
