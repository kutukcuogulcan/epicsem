import { Pool } from "pg";
import type {
  BulkImportResult,
  CmsConnection,
  ContentDraft,
  GapRow,
  GeneratedArticle,
  GeoVisibilitySummary,
  SeoAuditResult,
  SourceDomainStat,
  TopicVisibility,
} from "@/types";

/**
 * Persistence layer — Postgres via `pg` (node-postgres), connected through DATABASE_URL.
 *
 * This used to run on node:sqlite (a local file), which is fine for a single dev
 * machine but cannot survive as a real SaaS: a hosting platform's filesystem is either
 * ephemeral (serverless) or tied to one instance/volume, and a live product needs its
 * data reachable from wherever the app is actually running, 24/7. Postgres is what
 * every mainstream host (Render, Railway, Fly, a plain VPS) can give you as a managed,
 * persistent, network-reachable database, so that's what this now targets.
 *
 * Every data table is scoped by user_id (see lib/auth.ts for the auth/session layer
 * that produces it) — this became a multi-tenant SaaS on 2026-08-27, so nothing here
 * is safe to query without a user id in hand.
 */

// Bumping this drops and recreates every table — safe pre-launch (no real customer
// data yet) and much simpler than hand-rolling ALTER TABLE migrations for a schema
// that's still moving. Once there's real customer data, migrations need to become
// additive (ALTER TABLE ADD COLUMN) instead of this reset.
const SCHEMA_VERSION = 5;

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set — Postgres connection string is required (see .env.example)."
    );
  }
  pool = new Pool({
    connectionString,
    // Managed Postgres (Render/Railway/etc.) terminates TLS with a cert that isn't in
    // Node's default trust store; rejectUnauthorized:false still encrypts the
    // connection, it just skips CA verification, which is the standard pattern for
    // these providers. Local/dev Postgres usually has no TLS listener at all, so SSL
    // stays off outside production.
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
  return pool;
}

async function one<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const { rows } = await getPool().query(sql, params);
  return (rows[0] as T) ?? null;
}

async function many<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const { rows } = await getPool().query(sql, params);
  return rows as T[];
}

async function exec(sql: string, params: any[] = []): Promise<void> {
  await getPool().query(sql, params);
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

let schemaReady: Promise<void> | null = null;

/** Every exported function calls this first — cheap after the first call (cached promise). */
function ensureSchema(): Promise<void> {
  if (!schemaReady) schemaReady = initSchema();
  return schemaReady;
}

async function initSchema(): Promise<void> {
  const p = getPool();
  await p.query(`CREATE TABLE IF NOT EXISTS _meta (k TEXT PRIMARY KEY, v TEXT)`);
  const versionRow = await one<{ v: string }>(`SELECT v FROM _meta WHERE k = 'schema_version'`);
  const currentVersion = versionRow ? Number(versionRow.v) : 0;

  if (currentVersion < SCHEMA_VERSION) {
    await p.query(`
      DROP TABLE IF EXISTS alerts;
      DROP TABLE IF EXISTS monitor_checks;
      DROP TABLE IF EXISTS monitored_pages;
      DROP TABLE IF EXISTS gap_runs;
      DROP TABLE IF EXISTS geo_runs;
      DROP TABLE IF EXISTS audit_runs;
      DROP TABLE IF EXISTS import_runs;
      DROP TABLE IF EXISTS cms_connections;
      DROP TABLE IF EXISTS content_drafts;
      DROP TABLE IF EXISTS usage_counters;
      DROP TABLE IF EXISTS clients;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS users;
    `);
  }

  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS usage_counters (
      user_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      metric TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, period, metric),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS audit_runs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      score INTEGER NOT NULL,
      ai_crawl_score INTEGER NOT NULL,
      word_count INTEGER NOT NULL,
      has_schema INTEGER NOT NULL,
      blocked_bots INTEGER NOT NULL,
      issue_count INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_runs_user_url ON audit_runs(user_id, url);

    CREATE TABLE IF NOT EXISTS geo_runs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      brand_name TEXT NOT NULL,
      brand_domain TEXT NOT NULL,
      demo_mode INTEGER NOT NULL,
      summaries_json TEXT NOT NULL,
      source_distribution_json TEXT NOT NULL,
      topic_breakdown_json TEXT NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_geo_runs_user_domain ON geo_runs(user_id, brand_domain);

    CREATE TABLE IF NOT EXISTS gap_runs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      brand_name TEXT NOT NULL,
      brand_domain TEXT NOT NULL,
      gap_matrix_json TEXT NOT NULL,
      summaries_json TEXT NOT NULL,
      demo_mode INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_gap_runs_user_domain ON gap_runs(user_id, brand_domain);

    CREATE TABLE IF NOT EXISTS monitored_pages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      label TEXT,
      slack_webhook TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, url)
    );

    CREATE TABLE IF NOT EXISTS monitor_checks (
      id SERIAL PRIMARY KEY,
      monitored_page_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      ai_crawl_score INTEGER NOT NULL,
      blocked_bots_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (monitored_page_id) REFERENCES monitored_pages(id)
    );
    CREATE INDEX IF NOT EXISTS idx_monitor_checks_page ON monitor_checks(monitored_page_id);

    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      monitored_page_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (monitored_page_id) REFERENCES monitored_pages(id)
    );

    CREATE TABLE IF NOT EXISTS import_runs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      summary_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_import_runs_user ON import_runs(user_id);

    CREATE TABLE IF NOT EXISTS cms_connections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      site_url TEXT NOT NULL,
      wp_username TEXT NOT NULL,
      wp_app_password TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_cms_connections_user ON cms_connections(user_id);

    CREATE TABLE IF NOT EXISTS content_drafts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      source_url TEXT NOT NULL,
      article_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      published_connection_id INTEGER,
      published_post_url TEXT,
      published_edit_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_content_drafts_user ON content_drafts(user_id);

    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      competitors_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
  `);

  await p.query(
    `INSERT INTO _meta (k, v) VALUES ('schema_version', $1)
     ON CONFLICT (k) DO UPDATE SET v = excluded.v`,
    [String(SCHEMA_VERSION)]
  );
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
  return { id: row.id, email: row.email, passwordHash: row.password_hash, name: row.name, createdAt: toIso(row.created_at) };
}

export async function createUser(email: string, passwordHash: string, name: string | null): Promise<UserRow> {
  await ensureSchema();
  const row = await one<any>(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *`,
    [email, passwordHash, name]
  );
  return rowToUser(row);
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  await ensureSchema();
  const row = await one<any>(`SELECT * FROM users WHERE email = $1`, [email]);
  return row ? rowToUser(row) : null;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  await ensureSchema();
  const row = await one<any>(`SELECT * FROM users WHERE id = $1`, [id]);
  return row ? rowToUser(row) : null;
}

export async function createSession(token: string, userId: number, expiresAt: string): Promise<void> {
  await ensureSchema();
  await exec(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`, [token, userId, expiresAt]);
}

export async function getSession(token: string): Promise<{ userId: number; expiresAt: string } | null> {
  await ensureSchema();
  const row = await one<any>(`SELECT * FROM sessions WHERE token = $1`, [token]);
  return row ? { userId: row.user_id, expiresAt: toIso(row.expires_at) } : null;
}

export async function deleteSession(token: string): Promise<void> {
  await ensureSchema();
  await exec(`DELETE FROM sessions WHERE token = $1`, [token]);
}

// ---------------- audit runs ----------------

export async function saveAuditRun(userId: number, result: SeoAuditResult): Promise<void> {
  await ensureSchema();
  const blockedBots = result.meta.aiBotAccess.filter((b) => !b.allowed).length;
  await exec(
    `INSERT INTO audit_runs (user_id, url, score, ai_crawl_score, word_count, has_schema, blocked_bots, issue_count, result_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      userId,
      result.url,
      result.score,
      result.aiCrawlScore,
      result.meta.wordCount,
      result.meta.hasSchema ? 1 : 0,
      blockedBots,
      result.issues.length,
      JSON.stringify(result),
    ]
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
    createdAt: toIso(row.created_at),
  };
}

/**
 * The run before the one just inserted, for this exact user+URL — null on a page's
 * first ever recorded run (there's nothing to compare against yet, not "compare to
 * itself").
 */
export async function getPreviousAuditRun(userId: number, url: string): Promise<AuditRunSummary | null> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT * FROM audit_runs WHERE user_id = $1 AND url = $2 ORDER BY id DESC LIMIT 2`,
    [userId, url]
  );
  if (rows.length < 2) return null;
  return rowToAuditSummary(rows[1]);
}

export async function getAuditHistory(userId: number, url: string, limit = 10): Promise<AuditRunSummary[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT * FROM audit_runs WHERE user_id = $1 AND url = $2 ORDER BY id DESC LIMIT $3`,
    [userId, url, limit]
  );
  return rows.map(rowToAuditSummary);
}

// ---------------- geo runs ----------------

export async function saveGeoRun(userId: number, params: {
  brandName: string;
  brandDomain: string;
  demoMode: boolean;
  summaries: GeoVisibilitySummary[];
  sourceDistribution: SourceDomainStat[];
  topicBreakdown: TopicVisibility[];
}): Promise<void> {
  await ensureSchema();
  await exec(
    `INSERT INTO geo_runs (user_id, brand_name, brand_domain, demo_mode, summaries_json, source_distribution_json, topic_breakdown_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userId,
      params.brandName,
      params.brandDomain,
      params.demoMode ? 1 : 0,
      JSON.stringify(params.summaries),
      JSON.stringify(params.sourceDistribution),
      JSON.stringify(params.topicBreakdown),
    ]
  );
}

export interface GeoRunRow {
  id: number;
  brandName: string;
  brandDomain: string;
  demoMode: boolean;
  summaries: GeoVisibilitySummary[];
  topicBreakdown: TopicVisibility[];
  createdAt: string;
}

export async function getPreviousGeoRun(userId: number, brandDomain: string): Promise<GeoRunRow | null> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT * FROM geo_runs WHERE user_id = $1 AND brand_domain = $2 ORDER BY id DESC LIMIT 2`,
    [userId, brandDomain]
  );
  if (rows.length < 2) return null;
  const row = rows[1];
  return {
    id: row.id,
    brandName: row.brand_name,
    brandDomain: row.brand_domain,
    demoMode: !!row.demo_mode,
    summaries: JSON.parse(row.summaries_json),
    topicBreakdown: row.topic_breakdown_json ? JSON.parse(row.topic_breakdown_json) : [],
    createdAt: toIso(row.created_at),
  };
}

/**
 * Chronological (oldest→newest) run history for this brand — powers the /geo trend
 * chart (visibility over time, one line per brand), as opposed to getPreviousGeoRun's
 * single most-recent-vs-current comparison used for the "Δ visibility" column.
 */
export async function listGeoRunHistory(userId: number, brandDomain: string, limit = 20): Promise<GeoRunRow[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT * FROM (
       SELECT * FROM geo_runs WHERE user_id = $1 AND brand_domain = $2 ORDER BY id DESC LIMIT $3
     ) AS recent ORDER BY id ASC`,
    [userId, brandDomain, limit]
  );
  return rows.map((row) => ({
    id: row.id,
    brandName: row.brand_name,
    brandDomain: row.brand_domain,
    demoMode: !!row.demo_mode,
    summaries: JSON.parse(row.summaries_json),
    topicBreakdown: row.topic_breakdown_json ? JSON.parse(row.topic_breakdown_json) : [],
    createdAt: toIso(row.created_at),
  }));
}

// ---------------- gap runs ----------------

export async function saveGapRun(userId: number, params: {
  brandName: string;
  brandDomain: string;
  demoMode: boolean;
  gapMatrix: GapRow[];
  summaries: GeoVisibilitySummary[];
}): Promise<void> {
  await ensureSchema();
  await exec(
    `INSERT INTO gap_runs (user_id, brand_name, brand_domain, gap_matrix_json, summaries_json, demo_mode)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId,
      params.brandName,
      params.brandDomain,
      JSON.stringify(params.gapMatrix),
      JSON.stringify(params.summaries),
      params.demoMode ? 1 : 0,
    ]
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
    createdAt: toIso(row.created_at),
  };
}

export async function addMonitoredPage(userId: number, url: string, label?: string, slackWebhook?: string): Promise<MonitoredPage> {
  await ensureSchema();
  const row = await one<any>(
    `INSERT INTO monitored_pages (user_id, url, label, slack_webhook) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, url) DO UPDATE SET label = excluded.label, slack_webhook = excluded.slack_webhook
     RETURNING *`,
    [userId, url, label ?? null, slackWebhook ?? null]
  );
  return rowToMonitoredPage(row);
}

export async function listMonitoredPages(userId: number): Promise<MonitoredPage[]> {
  await ensureSchema();
  const rows = await many<any>(`SELECT * FROM monitored_pages WHERE user_id = $1 ORDER BY id DESC`, [userId]);
  return rows.map(rowToMonitoredPage);
}

/** Cron-only: every monitored page across every user. Never expose this to a per-user API response. */
export async function listAllMonitoredPages(): Promise<MonitoredPage[]> {
  await ensureSchema();
  const rows = await many<any>(`SELECT * FROM monitored_pages ORDER BY id DESC`);
  return rows.map(rowToMonitoredPage);
}

export async function removeMonitoredPage(userId: number, id: number): Promise<void> {
  await ensureSchema();
  const owned = await one<any>(`SELECT id FROM monitored_pages WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!owned) return;
  await exec(`DELETE FROM alerts WHERE monitored_page_id = $1`, [id]);
  await exec(`DELETE FROM monitor_checks WHERE monitored_page_id = $1`, [id]);
  await exec(`DELETE FROM monitored_pages WHERE id = $1`, [id]);
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
    createdAt: toIso(row.created_at),
  };
}

export async function getLatestMonitorCheck(pageId: number): Promise<MonitorCheck | null> {
  await ensureSchema();
  const row = await one<any>(
    `SELECT * FROM monitor_checks WHERE monitored_page_id = $1 ORDER BY id DESC LIMIT 1`,
    [pageId]
  );
  return row ? rowToMonitorCheck(row) : null;
}

export async function saveMonitorCheck(pageId: number, score: number, aiCrawlScore: number, blockedBots: string[]): Promise<void> {
  await ensureSchema();
  await exec(
    `INSERT INTO monitor_checks (monitored_page_id, score, ai_crawl_score, blocked_bots_json) VALUES ($1, $2, $3, $4)`,
    [pageId, score, aiCrawlScore, JSON.stringify(blockedBots)]
  );
}

/**
 * Chronological (oldest→newest) score history for one monitored page, for the trend
 * chart on /monitor — this is the "post-publish monitoring over time" view that's the
 * whole point of AXO monitoring, not just a snapshot of the latest check.
 * Ownership-checked: returns [] for a pageId the calling user doesn't own instead of
 * throwing, same defensive style as removeMonitoredPage.
 */
export async function getMonitorCheckHistory(userId: number, pageId: number, limit = 60): Promise<MonitorCheck[]> {
  await ensureSchema();
  const owned = await one<any>(`SELECT id FROM monitored_pages WHERE id = $1 AND user_id = $2`, [pageId, userId]);
  if (!owned) return [];
  const rows = await many<any>(
    `SELECT * FROM (
       SELECT * FROM monitor_checks WHERE monitored_page_id = $1 ORDER BY id DESC LIMIT $2
     ) AS recent ORDER BY id ASC`,
    [pageId, limit]
  );
  return rows.map(rowToMonitorCheck);
}

export interface Alert {
  id: number;
  monitoredPageId: number;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

export async function createAlert(pageId: number, message: string): Promise<void> {
  await ensureSchema();
  await exec(`INSERT INTO alerts (monitored_page_id, message) VALUES ($1, $2)`, [pageId, message]);
}

export async function listAlerts(userId: number, includeAcknowledged = false): Promise<(Alert & { url: string })[]> {
  await ensureSchema();
  const sql = includeAcknowledged
    ? `SELECT alerts.*, monitored_pages.url as page_url FROM alerts
       JOIN monitored_pages ON monitored_pages.id = alerts.monitored_page_id
       WHERE monitored_pages.user_id = $1 ORDER BY alerts.id DESC`
    : `SELECT alerts.*, monitored_pages.url as page_url FROM alerts
       JOIN monitored_pages ON monitored_pages.id = alerts.monitored_page_id
       WHERE monitored_pages.user_id = $1 AND acknowledged = 0 ORDER BY alerts.id DESC`;
  const rows = await many<any>(sql, [userId]);
  return rows.map((row) => ({
    id: row.id,
    monitoredPageId: row.monitored_page_id,
    message: row.message,
    acknowledged: !!row.acknowledged,
    createdAt: toIso(row.created_at),
    url: row.page_url,
  }));
}

export async function acknowledgeAlert(userId: number, id: number): Promise<void> {
  await ensureSchema();
  await exec(
    `UPDATE alerts SET acknowledged = 1
     WHERE id = $1 AND monitored_page_id IN (SELECT id FROM monitored_pages WHERE user_id = $2)`,
    [id, userId]
  );
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
    createdAt: toIso(row.created_at),
  };
}

export async function createClient(userId: number, params: {
  name: string;
  domain: string;
  competitors: { name: string; domain: string }[];
  notes?: string;
}): Promise<Client> {
  await ensureSchema();
  const row = await one<any>(
    `INSERT INTO clients (user_id, name, domain, competitors_json, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, params.name, params.domain, JSON.stringify(params.competitors), params.notes ?? null]
  );
  return rowToClient(row);
}

export async function listClients(userId: number): Promise<Client[]> {
  await ensureSchema();
  const rows = await many<any>(`SELECT * FROM clients WHERE user_id = $1 ORDER BY id DESC`, [userId]);
  return rows.map(rowToClient);
}

export async function getClient(userId: number, id: number): Promise<Client | null> {
  await ensureSchema();
  const row = await one<any>(`SELECT * FROM clients WHERE id = $1 AND user_id = $2`, [id, userId]);
  return row ? rowToClient(row) : null;
}

export async function deleteClient(userId: number, id: number): Promise<void> {
  await ensureSchema();
  await exec(`DELETE FROM clients WHERE id = $1 AND user_id = $2`, [id, userId]);
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
    createdAt: toIso(row.created_at),
  };
}

export async function saveImportRun(userId: number, result: BulkImportResult): Promise<number> {
  await ensureSchema();
  const row = await one<any>(
    `INSERT INTO import_runs (user_id, filename, row_count, summary_json, result_json) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, result.filename, result.summary.totalRows, JSON.stringify(result.summary), JSON.stringify(result)]
  );
  return Number(row.id);
}

export async function listImportRuns(userId: number, limit = 20): Promise<ImportRunSummary[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT id, filename, row_count, summary_json, created_at FROM import_runs WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [userId, limit]
  );
  return rows.map(rowToImportRunSummary);
}

/** Ownership-checked — returns null instead of another user's import data. */
export async function getImportRun(userId: number, id: number): Promise<BulkImportResult | null> {
  await ensureSchema();
  const row = await one<any>(`SELECT result_json FROM import_runs WHERE id = $1 AND user_id = $2`, [id, userId]);
  return row ? JSON.parse(row.result_json) : null;
}

// ---------------- CMS connections (WordPress) ----------------
//
// wp_app_password is stored as plain text, same as monitored_pages.slack_webhook above —
// this is a scoped, individually-revocable "Application Password" credential (not the
// user's real WP login), so it's the same risk class as the webhook URLs already stored
// this way. list/getMasked never return the raw value to the client — only
// publishToWordpress (server-side only) reads it in full.

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
    createdAt: toIso(row.created_at),
  };
}

export async function createCmsConnection(userId: number, params: {
  label: string;
  siteUrl: string;
  wpUsername: string;
  wpAppPassword: string;
}): Promise<CmsConnection> {
  await ensureSchema();
  const row = await one<any>(
    `INSERT INTO cms_connections (user_id, label, site_url, wp_username, wp_app_password) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, params.label, params.siteUrl, params.wpUsername, params.wpAppPassword]
  );
  return rowToCmsConnection(row);
}

export async function listCmsConnections(userId: number): Promise<CmsConnection[]> {
  await ensureSchema();
  const rows = await many<any>(`SELECT * FROM cms_connections WHERE user_id = $1 ORDER BY id DESC`, [userId]);
  return rows.map(rowToCmsConnection);
}

/** Server-side only (publish flow) — includes the raw app password. Never send this to the client. */
export interface CmsConnectionSecret {
  id: number;
  siteUrl: string;
  wpUsername: string;
  wpAppPassword: string;
}

export async function getCmsConnectionSecret(userId: number, id: number): Promise<CmsConnectionSecret | null> {
  await ensureSchema();
  const row = await one<any>(`SELECT * FROM cms_connections WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!row) return null;
  return { id: row.id, siteUrl: row.site_url, wpUsername: row.wp_username, wpAppPassword: row.wp_app_password };
}

export async function deleteCmsConnection(userId: number, id: number): Promise<void> {
  await ensureSchema();
  await exec(`DELETE FROM cms_connections WHERE id = $1 AND user_id = $2`, [id, userId]);
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
    createdAt: toIso(row.created_at),
  };
}

export async function saveContentDraft(userId: number, sourceUrl: string, article: GeneratedArticle): Promise<ContentDraft> {
  await ensureSchema();
  const row = await one<any>(
    `INSERT INTO content_drafts (user_id, source_url, article_json) VALUES ($1, $2, $3) RETURNING *`,
    [userId, sourceUrl, JSON.stringify(article)]
  );
  return rowToContentDraft(row);
}

export async function listContentDrafts(userId: number, limit = 30): Promise<ContentDraft[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT * FROM content_drafts WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [userId, limit]
  );
  return rows.map(rowToContentDraft);
}

export async function getContentDraft(userId: number, id: number): Promise<ContentDraft | null> {
  await ensureSchema();
  const row = await one<any>(`SELECT * FROM content_drafts WHERE id = $1 AND user_id = $2`, [id, userId]);
  return row ? rowToContentDraft(row) : null;
}

/** Ownership-checked — only marks the draft published if the calling user actually owns it. */
export async function markDraftPublished(userId: number, id: number, params: { connectionId: number; postUrl: string; editUrl: string }): Promise<void> {
  await ensureSchema();
  await exec(
    `UPDATE content_drafts SET status = 'published-to-wp', published_connection_id = $1, published_post_url = $2, published_edit_url = $3
     WHERE id = $4 AND user_id = $5`,
    [params.connectionId, params.postUrl, params.editUrl, id, userId]
  );
}

// ---------------- usage limits (see lib/plans.ts for the actual limit numbers) ----------------
//
// This is deliberately NOT a billing system — no Stripe, no payment, no plan upgrade
// flow. It's a safety counter so a real (non-demo) LLM call always has a ceiling once
// DEMO_MODE is off and real provider keys are connected. Every user is on 'free' today;
// the period key (calendar month, UTC) means the counter just starts over each month
// with no cleanup job needed — old rows are cheap and harmless to leave behind.

export function currentUsagePeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getUserPlan(userId: number): Promise<string> {
  await ensureSchema();
  const row = await one<any>(`SELECT plan FROM users WHERE id = $1`, [userId]);
  return row?.plan ?? "free";
}

export async function getUsageCount(userId: number, metric: string, period: string = currentUsagePeriod()): Promise<number> {
  await ensureSchema();
  const row = await one<any>(
    `SELECT count FROM usage_counters WHERE user_id = $1 AND period = $2 AND metric = $3`,
    [userId, period, metric]
  );
  return row?.count ?? 0;
}

export async function incrementUsage(userId: number, metric: string, amount: number, period: string = currentUsagePeriod()): Promise<void> {
  await ensureSchema();
  await exec(
    `INSERT INTO usage_counters (user_id, period, metric, count) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, period, metric) DO UPDATE SET count = usage_counters.count + excluded.count, updated_at = now()`,
    [userId, period, metric, amount]
  );
}
