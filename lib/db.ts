import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type {
  BulkImportResult,
  CmsConnection,
  ContentDraft,
  GapRow,
  GeneratedArticle,
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
 *
 * Every data table is scoped by user_id (see lib/auth.ts for the auth/session layer
 * that produces it) — this became a multi-tenant SaaS on 2026-08-27, so nothing here
 * is safe to query without a user id in hand.
 */

// Bumping this drops and recreates every table — safe pre-launch (no real customer
// data yet) and much simpler than hand-rolling ALTER TABLE migrations for a schema
// that's still moving. Once there's real customer data, migrations need to become
// additive (ALTER TABLE ADD COLUMN) instead of this reset.
const SCHEMA_VERSION = 2;

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  const dir = path.join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(path.join(dir, "epicsem.db"));

  const versionRow = db.prepare(`PRAGMA user_version`).get() as any;
  const currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion < SCHEMA_VERSION) {
    db.exec(`
      DROP TABLE IF EXISTS alerts;
      DROP TABLE IF EXISTS monitor_checks;
      DROP TABLE IF EXISTS monitored_pages;
      DROP TABLE IF EXISTS gap_runs;
      DROP TABLE IF EXISTS geo_runs;
      DROP TABLE IF EXISTS audit_runs;
      DROP TABLE IF EXISTS clients;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS users;
    `);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS audit_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
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
    CREATE INDEX IF NOT EXISTS idx_audit_runs_user_url ON audit_runs(user_id, url);

    CREATE TABLE IF NOT EXISTS geo_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      brand_name TEXT NOT NULL,
      brand_domain TEXT NOT NULL,
      demo_mode INTEGER NOT NULL,
      summaries_json TEXT NOT NULL,
      source_distribution_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_geo_runs_user_domain ON geo_runs(user_id, brand_domain);

    CREATE TABLE IF NOT EXISTS gap_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      brand_name TEXT NOT NULL,
      brand_domain TEXT NOT NULL,
      gap_matrix_json TEXT NOT NULL,
      summaries_json TEXT NOT NULL,
      demo_mode INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_gap_runs_user_domain ON gap_runs(user_id, brand_domain);

    CREATE TABLE IF NOT EXISTS monitored_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      label TEXT,
      slack_webhook TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, url)
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

    CREATE TABLE IF NOT EXISTS import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      summary_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_import_runs_user ON import_runs(user_id);

    CREATE TABLE IF NOT EXISTS cms_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      site_url TEXT NOT NULL,
      wp_username TEXT NOT NULL,
      wp_app_password TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_cms_connections_user ON cms_connections(user_id);

    CREATE TABLE IF NOT EXISTS content_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_url TEXT NOT NULL,
      article_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      published_connection_id INTEGER,
      published_post_url TEXT,
      published_edit_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_content_drafts_user ON content_drafts(user_id);

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      competitors_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
  `);
  return db;
}

// ---------------- users & sessions (see lib/auth.ts for hashing/cookie logic) ----------------

export interface UserRow {
  id: number;
  email: string;
  passwordHash: string;
  name: string | null;
  createdAt: string;
}

function rowToUser(row: any): UserRow {
  return { id: row.id, email: row.email, passwordHash: row.password_hash, name: row.name, createdAt: row.created_at };
}

export function createUser(email: string, passwordHash: string, name: string | null): UserRow {
  const d = getDb();
  const info = d
    .prepare(`INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)`)
    .run(email, passwordHash, name);
  const row = d.prepare(`SELECT * FROM users WHERE id = ?`).get(info.lastInsertRowid) as any;
  return rowToUser(row);
}

export function findUserByEmail(email: string): UserRow | null {
  const d = getDb();
  const row = d.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
  return row ? rowToUser(row) : null;
}

export function findUserById(id: number): UserRow | null {
  const d = getDb();
  const row = d.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as any;
  return row ? rowToUser(row) : null;
}

export function createSession(token: string, userId: number, expiresAt: string) {
  const d = getDb();
  d.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(token, userId, expiresAt);
}

export function getSession(token: string): { userId: number; expiresAt: string } | null {
  const d = getDb();
  const row = d.prepare(`SELECT * FROM sessions WHERE token = ?`).get(token) as any;
  return row ? { userId: row.user_id, expiresAt: row.expires_at } : null;
}

export function deleteSession(token: string) {
  const d = getDb();
  d.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

// ---------------- audit runs ----------------

export function saveAuditRun(userId: number, result: SeoAuditResult) {
  const d = getDb();
  const blockedBots = result.meta.aiBotAccess.filter((b) => !b.allowed).length;
  d.prepare(
    `INSERT INTO audit_runs (user_id, url, score, ai_crawl_score, word_count, has_schema, blocked_bots, issue_count, result_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
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
 * The run before the one just inserted, for this exact user+URL — null on a page's
 * first ever recorded run (there's nothing to compare against yet, not "compare to
 * itself").
 */
export function getPreviousAuditRun(userId: number, url: string): AuditRunSummary | null {
  const d = getDb();
  const rows = d
    .prepare(`SELECT * FROM audit_runs WHERE user_id = ? AND url = ? ORDER BY id DESC LIMIT 2`)
    .all(userId, url) as any[];
  if (rows.length < 2) return null;
  return rowToAuditSummary(rows[1]);
}

export function getAuditHistory(userId: number, url: string, limit = 10): AuditRunSummary[] {
  const d = getDb();
  const rows = d
    .prepare(`SELECT * FROM audit_runs WHERE user_id = ? AND url = ? ORDER BY id DESC LIMIT ?`)
    .all(userId, url, limit) as any[];
  return rows.map(rowToAuditSummary);
}

// ---------------- geo runs ----------------

export function saveGeoRun(userId: number, params: {
  brandName: string;
  brandDomain: string;
  demoMode: boolean;
  summaries: GeoVisibilitySummary[];
  sourceDistribution: SourceDomainStat[];
}) {
  const d = getDb();
  d.prepare(
    `INSERT INTO geo_runs (user_id, brand_name, brand_domain, demo_mode, summaries_json, source_distribution_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
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

export function getPreviousGeoRun(userId: number, brandDomain: string): GeoRunRow | null {
  const d = getDb();
  const rows = d
    .prepare(`SELECT * FROM geo_runs WHERE user_id = ? AND brand_domain = ? ORDER BY id DESC LIMIT 2`)
    .all(userId, brandDomain) as any[];
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

export function saveGapRun(userId: number, params: {
  brandName: string;
  brandDomain: string;
  demoMode: boolean;
  gapMatrix: GapRow[];
  summaries: GeoVisibilitySummary[];
}) {
  const d = getDb();
  d.prepare(
    `INSERT INTO gap_runs (user_id, brand_name, brand_domain, gap_matrix_json, summaries_json, demo_mode)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
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
  userId: number;
  url: string;
  label: string | null;
  slackWebhook: string | null;
  createdAt: string;
}

function rowToMonitoredPage(row: any): MonitoredPage {
  return {
    id: row.id,
    userId: row.user_id,
    url: row.url,
    label: row.label,
    slackWebhook: row.slack_webhook,
    createdAt: row.created_at,
  };
}

export function addMonitoredPage(userId: number, url: string, label?: string, slackWebhook?: string): MonitoredPage {
  const d = getDb();
  d.prepare(
    `INSERT INTO monitored_pages (user_id, url, label, slack_webhook) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, url) DO UPDATE SET label = excluded.label, slack_webhook = excluded.slack_webhook`
  ).run(userId, url, label ?? null, slackWebhook ?? null);
  const row = d.prepare(`SELECT * FROM monitored_pages WHERE user_id = ? AND url = ?`).get(userId, url) as any;
  return rowToMonitoredPage(row);
}

export function listMonitoredPages(userId: number): MonitoredPage[] {
  const d = getDb();
  const rows = d.prepare(`SELECT * FROM monitored_pages WHERE user_id = ? ORDER BY id DESC`).all(userId) as any[];
  return rows.map(rowToMonitoredPage);
}

/** Cron-only: every monitored page across every user. Never expose this to a per-user API response. */
export function listAllMonitoredPages(): MonitoredPage[] {
  const d = getDb();
  const rows = d.prepare(`SELECT * FROM monitored_pages ORDER BY id DESC`).all() as any[];
  return rows.map(rowToMonitoredPage);
}

export function removeMonitoredPage(userId: number, id: number) {
  const d = getDb();
  const owned = d.prepare(`SELECT id FROM monitored_pages WHERE id = ? AND user_id = ?`).get(id, userId);
  if (!owned) return;
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

/**
 * Chronological (oldest→newest) score history for one monitored page, for the trend
 * chart on /monitor — this is the "post-publish monitoring over time" view that's the
 * whole point of AXO monitoring, not just a snapshot of the latest check.
 * Ownership-checked: returns [] for a pageId the calling user doesn't own instead of
 * throwing, same defensive style as removeMonitoredPage.
 */
export function getMonitorCheckHistory(userId: number, pageId: number, limit = 60): MonitorCheck[] {
  const d = getDb();
  const owned = d.prepare(`SELECT id FROM monitored_pages WHERE id = ? AND user_id = ?`).get(pageId, userId);
  if (!owned) return [];
  const rows = d
    .prepare(
      `SELECT * FROM (
         SELECT * FROM monitor_checks WHERE monitored_page_id = ? ORDER BY id DESC LIMIT ?
       ) ORDER BY id ASC`
    )
    .all(pageId, limit) as any[];
  return rows.map(rowToMonitorCheck);
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

export function listAlerts(userId: number, includeAcknowledged = false): (Alert & { url: string })[] {
  const d = getDb();
  const sql = includeAcknowledged
    ? `SELECT alerts.*, monitored_pages.url as page_url FROM alerts
       JOIN monitored_pages ON monitored_pages.id = alerts.monitored_page_id
       WHERE monitored_pages.user_id = ? ORDER BY alerts.id DESC`
    : `SELECT alerts.*, monitored_pages.url as page_url FROM alerts
       JOIN monitored_pages ON monitored_pages.id = alerts.monitored_page_id
       WHERE monitored_pages.user_id = ? AND acknowledged = 0 ORDER BY alerts.id DESC`;
  const rows = d.prepare(sql).all(userId) as any[];
  return rows.map((row) => ({
    id: row.id,
    monitoredPageId: row.monitored_page_id,
    message: row.message,
    acknowledged: !!row.acknowledged,
    createdAt: row.created_at,
    url: row.page_url,
  }));
}

export function acknowledgeAlert(userId: number, id: number) {
  const d = getDb();
  d.prepare(
    `UPDATE alerts SET acknowledged = 1
     WHERE id = ? AND monitored_page_id IN (SELECT id FROM monitored_pages WHERE user_id = ?)`
  ).run(id, userId);
}

// ---------------- clients ----------------

export interface Client {
  id: number;
  userId: number;
  name: string;
  domain: string;
  competitors: { name: string; domain: string }[];
  notes: string | null;
  createdAt: string;
}

function rowToClient(row: any): Client {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    domain: row.domain,
    competitors: JSON.parse(row.competitors_json),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function createClient(userId: number, params: {
  name: string;
  domain: string;
  competitors: { name: string; domain: string }[];
  notes?: string;
}): Client {
  const d = getDb();
  const info = d
    .prepare(`INSERT INTO clients (user_id, name, domain, competitors_json, notes) VALUES (?, ?, ?, ?, ?)`)
    .run(userId, params.name, params.domain, JSON.stringify(params.competitors), params.notes ?? null);
  const row = d.prepare(`SELECT * FROM clients WHERE id = ?`).get(info.lastInsertRowid) as any;
  return rowToClient(row);
}

export function listClients(userId: number): Client[] {
  const d = getDb();
  const rows = d.prepare(`SELECT * FROM clients WHERE user_id = ? ORDER BY id DESC`).all(userId) as any[];
  return rows.map(rowToClient);
}

export function getClient(userId: number, id: number): Client | null {
  const d = getDb();
  const row = d.prepare(`SELECT * FROM clients WHERE id = ? AND user_id = ?`).get(id, userId) as any;
  return row ? rowToClient(row) : null;
}

export function deleteClient(userId: number, id: number) {
  const d = getDb();
  d.prepare(`DELETE FROM clients WHERE id = ? AND user_id = ?`).run(id, userId);
}

// ---------------- bulk (Screaming Frog) import runs ----------------

export interface ImportRunSummary {
  id: number;
  filename: string;
  rowCount: number;
  summary: BulkImportResult["summary"];
  createdAt: string;
}

function rowToImportRunSummary(row: any): ImportRunSummary {
  return {
    id: row.id,
    filename: row.filename,
    rowCount: row.row_count,
    summary: JSON.parse(row.summary_json),
    createdAt: row.created_at,
  };
}

export function saveImportRun(userId: number, result: BulkImportResult): number {
  const d = getDb();
  const info = d
    .prepare(
      `INSERT INTO import_runs (user_id, filename, row_count, summary_json, result_json) VALUES (?, ?, ?, ?, ?)`
    )
    .run(userId, result.filename, result.summary.totalRows, JSON.stringify(result.summary), JSON.stringify(result));
  return Number(info.lastInsertRowid);
}

export function listImportRuns(userId: number, limit = 20): ImportRunSummary[] {
  const d = getDb();
  const rows = d
    .prepare(`SELECT id, filename, row_count, summary_json, created_at FROM import_runs WHERE user_id = ? ORDER BY id DESC LIMIT ?`)
    .all(userId, limit) as any[];
  return rows.map(rowToImportRunSummary);
}

/** Ownership-checked — returns null instead of another user's import data. */
export function getImportRun(userId: number, id: number): BulkImportResult | null {
  const d = getDb();
  const row = d.prepare(`SELECT result_json FROM import_runs WHERE id = ? AND user_id = ?`).get(id, userId) as any;
  return row ? JSON.parse(row.result_json) : null;
}

// ---------------- CMS connections (WordPress) ----------------
//
// wp_app_password is stored as plain text, same as monitored_pages.slack_webhook above —
// this is a single-tenant-per-row SQLite file on the app's own Railway volume, not a
// shared multi-app database, and a WordPress "Application Password" is itself a scoped,
// individually-revocable credential (not the user's real WP login), so this is the same
// risk class as the webhook URLs already stored this way. list/getMasked never return the
// raw value to the client — only publishToWordPress (server-side only) reads it in full.

function maskSecret(secret: string): string {
  if (secret.length <= 4) return "••••";
  return `••••${secret.slice(-4)}`;
}

function rowToCmsConnection(row: any): CmsConnection {
  return {
    id: row.id,
    label: row.label,
    siteUrl: row.site_url,
    wpUsername: row.wp_username,
    wpAppPasswordMasked: maskSecret(row.wp_app_password),
    createdAt: row.created_at,
  };
}

export function createCmsConnection(userId: number, params: {
  label: string;
  siteUrl: string;
  wpUsername: string;
  wpAppPassword: string;
}): CmsConnection {
  const d = getDb();
  const info = d
    .prepare(`INSERT INTO cms_connections (user_id, label, site_url, wp_username, wp_app_password) VALUES (?, ?, ?, ?, ?)`)
    .run(userId, params.label, params.siteUrl, params.wpUsername, params.wpAppPassword);
  const row = d.prepare(`SELECT * FROM cms_connections WHERE id = ?`).get(info.lastInsertRowid) as any;
  return rowToCmsConnection(row);
}

export function listCmsConnections(userId: number): CmsConnection[] {
  const d = getDb();
  const rows = d.prepare(`SELECT * FROM cms_connections WHERE user_id = ? ORDER BY id DESC`).all(userId) as any[];
  return rows.map(rowToCmsConnection);
}

/** Server-side only (publish flow) — includes the raw app password. Never send this to the client. */
export interface CmsConnectionSecret {
  id: number;
  siteUrl: string;
  wpUsername: string;
  wpAppPassword: string;
}

export function getCmsConnectionSecret(userId: number, id: number): CmsConnectionSecret | null {
  const d = getDb();
  const row = d.prepare(`SELECT * FROM cms_connections WHERE id = ? AND user_id = ?`).get(id, userId) as any;
  if (!row) return null;
  return { id: row.id, siteUrl: row.site_url, wpUsername: row.wp_username, wpAppPassword: row.wp_app_password };
}

export function deleteCmsConnection(userId: number, id: number) {
  const d = getDb();
  d.prepare(`DELETE FROM cms_connections WHERE id = ? AND user_id = ?`).run(id, userId);
}

// ---------------- content drafts (generated articles) ----------------

function rowToContentDraft(row: any): ContentDraft {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    article: JSON.parse(row.article_json),
    status: row.status,
    publishedPostUrl: row.published_post_url,
    publishedEditUrl: row.published_edit_url,
    createdAt: row.created_at,
  };
}

export function saveContentDraft(userId: number, sourceUrl: string, article: GeneratedArticle): ContentDraft {
  const d = getDb();
  const info = d
    .prepare(`INSERT INTO content_drafts (user_id, source_url, article_json) VALUES (?, ?, ?)`)
    .run(userId, sourceUrl, JSON.stringify(article));
  const row = d.prepare(`SELECT * FROM content_drafts WHERE id = ?`).get(info.lastInsertRowid) as any;
  return rowToContentDraft(row);
}

export function listContentDrafts(userId: number, limit = 30): ContentDraft[] {
  const d = getDb();
  const rows = d
    .prepare(`SELECT * FROM content_drafts WHERE user_id = ? ORDER BY id DESC LIMIT ?`)
    .all(userId, limit) as any[];
  return rows.map(rowToContentDraft);
}

export function getContentDraft(userId: number, id: number): ContentDraft | null {
  const d = getDb();
  const row = d.prepare(`SELECT * FROM content_drafts WHERE id = ? AND user_id = ?`).get(id, userId) as any;
  return row ? rowToContentDraft(row) : null;
}

/** Ownership-checked — only marks the draft published if the calling user actually owns it. */
export function markDraftPublished(userId: number, id: number, params: { connectionId: number; postUrl: string; editUrl: string }) {
  const d = getDb();
  d.prepare(
    `UPDATE content_drafts SET status = 'published-to-wp', published_connection_id = ?, published_post_url = ?, published_edit_url = ?
     WHERE id = ? AND user_id = ?`
  ).run(params.connectionId, params.postUrl, params.editUrl, id, userId);
}
