import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type {
  GapRow,
  GeoVisibilitySummary,
  SeoAuditResult,
  SourceDomainStat,
} from "@/types";

/**
 * Persistence layer. Prisma's schema (prisma/schema.prisma) documents the intended
 * shape, but `prisma generate` needs to download a native query-engine binary — that
 * fetch is blocked in some sandboxed/offline environments. node:sqlite is built into
 * Node 22+, needs no native download, and covers everything this MVP actually needs
 * (a handful of tables, no complex joins), so it's what actually runs the app.
 */

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  const dir = path.join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(path.join(dir, "epicsem.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      score INTEGER NOT NULL,
      ai_crawl_score INTEGER NOT NULL,
      word_count INTEGER NOT NULL,
      has_schema INTEGER NOT NULL,
      blocked_bots INTEGER NOT NULL,
      issue_count INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_runs_url ON audit_runs(url);

    CREATE TABLE IF NOT EXISTS geo_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_name TEXT NOT NULL,
      brand_domain TEXT NOT NULL,
      demo_mode INTEGER NOT NULL,
      summaries_json TEXT NOT NULL,
      source_distribution_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_geo_runs_domain ON geo_runs(brand_domain);

    CREATE TABLE IF NOT EXISTS gap_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_name TEXT NOT NULL,
      brand_domain TEXT NOT NULL,
      gap_matrix_json TEXT NOT NULL,
      summaries_json TEXT NOT NULL,
      demo_mode INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_gap_runs_domain ON gap_runs(brand_domain);

    CREATE TABLE IF NOT EXISTS monitored_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      label TEXT,
      slack_webhook TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monitor_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitored_page_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      ai_crawl_score INTEGER NOT NULL,
      blocked_bots_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (monitored_page_id) REFERENCES monitored_pages(id)
    );
    CREATE INDEX IF NOT EXISTS idx_monitor_checks_page ON monitor_checks(monitored_page_id);

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitored_page_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (monitored_page_id) REFERENCES monitored_pages(id)
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      competitors_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

// ---------------- audit runs ----------------

export function saveAuditRun(result: SeoAuditResult) {
  const d = getDb();
  const blockedBots = result.meta.aiBotAccess.filter((b) => !b.allowed).length;
  d.prepare(
    `INSERT INTO audit_runs (url, score, ai_crawl_score, word_count, has_schema, blocked_bots, issue_count, result_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    result.url,
    result.score,
    result.aiCrawlScore,
    result.meta.wordCount,
    result.meta.hasSchema ? 1 : 0,
    blockedBots,
    result.issues.length,
    JSON.stringify(result)
  );
}

export interface AuditRunSummary {
  id: number;
  url: string;
  score: number;
  aiCrawlScore: number;
  wordCount: number;
  hasSchema: boolean;
  blockedBots: number;
  issueCount: number;
  createdAt: string;
}

function rowToAuditSummary(row: any): AuditRunSummary {
  return {
    id: row.id,
    url: row.url,
    score: row.score,
    aiCrawlScore: row.ai_crawl_score,
    wordCount: row.word_count,
    hasSchema: !!row.has_schema,
    blockedBots: row.blocked_bots,
    issueCount: row.issue_count,
    createdAt: row.created_at,
  };
}

/**
 * The run before the one just inserted, for this exact URL — null on a page's first
 * ever recorded run (there's nothing to compare against yet, not "compare to itself").
 */
export function getPreviousAuditRun(url: string): AuditRunSummary | null {
  const d = getDb();
  const rows = d
    .prepare(`SELECT * FROM audit_runs WHERE url = ? ORDER BY id DESC LIMIT 2`)
    .all(url) as any[];
  if (rows.length < 2) return null;
  return rowToAuditSummary(rows[1]);
}

export function getAuditHistory(url: string, limit = 10): AuditRunSummary[] {
  const d = getDb();
  const rows = d
    .prepare(`SELECT * FROM audit_runs WHERE url = ? ORDER BY id DESC LIMIT ?`)
    .all(url, limit) as any[];
  return rows.map(rowToAuditSummary);
}

// ---------------- geo runs ----------------

export function saveGeoRun(params: {
  brandName: string;
  brandDomain: string;
  demoMode: boolean;
  summaries: GeoVisibilitySummary[];
  sourceDistribution: SourceDomainStat[];
}) {
  const d = getDb();
  d.prepare(
    `INSERT INTO geo_runs (brand_name, brand_domain, demo_mode, summaries_json, source_distribution_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    params.brandName,
    params.brandDomain,
    params.demoMode ? 1 : 0,
    JSON.stringify(params.summaries),
    JSON.stringify(params.sourceDistribution)
  );
}

export interface GeoRunRow {
  id: number;
  brandName: string;
  brandDomain: string;
  demoMode: boolean;
  summaries: GeoVisibilitySummary[];
  createdAt: string;
}

export function getPreviousGeoRun(brandDomain: string): GeoRunRow | null {
  const d = getDb();
  const rows = d
    .prepare(`SELECT * FROM geo_runs WHERE brand_domain = ? ORDER BY id DESC LIMIT 2`)
    .all(brandDomain) as any[];
  if (rows.length < 2) return null;
  const row = rows[1];
  return {
    id: row.id,
    brandName: row.brand_name,
    brandDomain: row.brand_domain,
    demoMode: !!row.demo_mode,
    summaries: JSON.parse(row.summaries_json),
    createdAt: row.created_at,
  };
}

// ---------------- gap runs ----------------

export function saveGapRun(params: {
  brandName: string;
  brandDomain: string;
  demoMode: boolean;
  gapMatrix: GapRow[];
  summaries: GeoVisibilitySummary[];
}) {
  const d = getDb();
  d.prepare(
    `INSERT INTO gap_runs (brand_name, brand_domain, gap_matrix_json, summaries_json, demo_mode)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    params.brandName,
    params.brandDomain,
    JSON.stringify(params.gapMatrix),
    JSON.stringify(params.summaries),
    params.demoMode ? 1 : 0
  );
}

// ---------------- monitored pages ----------------

export interface MonitoredPage {
  id: number;
  url: string;
  label: string | null;
  slackWebhook: string | null;
  createdAt: string;
}

function rowToMonitoredPage(row: any): MonitoredPage {
  return { id: row.id, url: row.url, label: row.label, slackWebhook: row.slack_webhook, createdAt: row.created_at };
}

export function addMonitoredPage(url: string, label?: string, slackWebhook?: string): MonitoredPage {
  const d = getDb();
  d.prepare(
    `INSERT INTO monitored_pages (url, label, slack_webhook) VALUES (?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET label = excluded.label, slack_webhook = excluded.slack_webhook`
  ).run(url, label ?? null, slackWebhook ?? null);
  const row = d.prepare(`SELECT * FROM monitored_pages WHERE url = ?`).get(url) as any;
  return rowToMonitoredPage(row);
}

export function listMonitoredPages(): MonitoredPage[] {
  const d = getDb();
  const rows = d.prepare(`SELECT * FROM monitored_pages ORDER BY id DESC`).all() as any[];
  return rows.map(rowToMonitoredPage);
}

export function removeMonitoredPage(id: number) {
  const d = getDb();
  d.prepare(`DELETE FROM alerts WHERE monitored_page_id = ?`).run(id);
  d.prepare(`DELETE FROM monitor_checks WHERE monitored_page_id = ?`).run(id);
  d.prepare(`DELETE FROM monitored_pages WHERE id = ?`).run(id);
}

export interface MonitorCheck {
  id: number;
  monitoredPageId: number;
  score: number;
  aiCrawlScore: number;
  blockedBots: string[];
  createdAt: string;
}

function rowToMonitorCheck(row: any): MonitorCheck {
  return {
    id: row.id,
    monitoredPageId: row.monitored_page_id,
    score: row.score,
    aiCrawlScore: row.ai_crawl_score,
    blockedBots: JSON.parse(row.blocked_bots_json),
    createdAt: row.created_at,
  };
}

export function getLatestMonitorCheck(pageId: number): MonitorCheck | null {
  const d = getDb();
  const row = d
    .prepare(`SELECT * FROM monitor_checks WHERE monitored_page_id = ? ORDER BY id DESC LIMIT 1`)
    .get(pageId) as any;
  return row ? rowToMonitorCheck(row) : null;
}

export function saveMonitorCheck(pageId: number, score: number, aiCrawlScore: number, blockedBots: string[]) {
  const d = getDb();
  d.prepare(
    `INSERT INTO monitor_checks (monitored_page_id, score, ai_crawl_score, blocked_bots_json) VALUES (?, ?, ?, ?)`
  ).run(pageId, score, aiCrawlScore, JSON.stringify(blockedBots));
}

export interface Alert {
  id: number;
  monitoredPageId: number;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

export function createAlert(pageId: number, message: string) {
  const d = getDb();
  d.prepare(`INSERT INTO alerts (monitored_page_id, message) VALUES (?, ?)`).run(pageId, message);
}

export function listAlerts(includeAcknowledged = false): (Alert & { url: string })[] {
  const d = getDb();
  const sql = includeAcknowledged
    ? `SELECT alerts.*, monitored_pages.url as page_url FROM alerts JOIN monitored_pages ON monitored_pages.id = alerts.monitored_page_id ORDER BY alerts.id DESC`
    : `SELECT alerts.*, monitored_pages.url as page_url FROM alerts JOIN monitored_pages ON monitored_pages.id = alerts.monitored_page_id WHERE acknowledged = 0 ORDER BY alerts.id DESC`;
  const rows = d.prepare(sql).all() as any[];
  return rows.map((row) => ({
    id: row.id,
    monitoredPageId: row.monitored_page_id,
    message: row.message,
    acknowledged: !!row.acknowledged,
    createdAt: row.created_at,
    url: row.page_url,
  }));
}

export function acknowledgeAlert(id: number) {
  const d = getDb();
  d.prepare(`UPDATE alerts SET acknowledged = 1 WHERE id = ?`).run(id);
}

// ---------------- clients ----------------

export interface Client {
  id: number;
  name: string;
  domain: string;
  competitors: { name: string; domain: string }[];
  notes: string | null;
  createdAt: string;
}

function rowToClient(row: any): Client {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    competitors: JSON.parse(row.competitors_json),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function createClient(params: {
  name: string;
  domain: string;
  competitors: { name: string; domain: string }[];
  notes?: string;
}): Client {
  const d = getDb();
  const info = d
    .prepare(`INSERT INTO clients (name, domain, competitors_json, notes) VALUES (?, ?, ?, ?)`)
    .run(params.name, params.domain, JSON.stringify(params.competitors), params.notes ?? null);
  const row = d.prepare(`SELECT * FROM clients WHERE id = ?`).get(info.lastInsertRowid) as any;
  return rowToClient(row);
}

export function listClients(): Client[] {
  const d = getDb();
  const rows = d.prepare(`SELECT * FROM clients ORDER BY id DESC`).all() as any[];
  return rows.map(rowToClient);
}

export function getClient(id: number): Client | null {
  const d = getDb();
  const row = d.prepare(`SELECT * FROM clients WHERE id = ?`).get(id) as any;
  return row ? rowToClient(row) : null;
}

export function deleteClient(id: number) {
  const d = getDb();
  d.prepare(`DELETE FROM clients WHERE id = ?`).run(id);
}
