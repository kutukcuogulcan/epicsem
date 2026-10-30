import { Pool } from "pg";
import type {
  BulkImportResult,
  CmsConnection,
  CmsPlatform,
  ContentDraft,
  GapRow,
  GeneratedArticle,
  GeoRunResult,
  GeoVisibilitySummary,
  SeoAuditResult,
  SourceDomainStat,
  TopicVisibility,
} from "@/types";
import type { ContentBrief } from "@/lib/content-brief";
import { citabilityOfMarkdown } from "@/lib/citability";

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
const SCHEMA_VERSION = 6;

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
    ALTER TABLE geo_runs ADD COLUMN IF NOT EXISTS runs_json TEXT;
    ALTER TABLE geo_runs ADD COLUMN IF NOT EXISTS competitors_json TEXT;

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
      platform TEXT NOT NULL DEFAULT 'wordpress',
      label TEXT NOT NULL,
      site_url TEXT NOT NULL,
      auth_identifier TEXT NOT NULL DEFAULT '',
      auth_secret TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_cms_connections_user ON cms_connections(user_id);

    CREATE TABLE IF NOT EXISTS local_generations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      business TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT NOT NULL,
      rating INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_local_generations_user ON local_generations(user_id);

    CREATE TABLE IF NOT EXISTS brand_knowledge (
      user_id INTEGER PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

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

  // Additive migrations — run every boot, never gated behind SCHEMA_VERSION (which
  // drops every table). Safe on an already-running instance with real rows in it.
  // published_at backs the Overview dashboard's "Generated vs Published" activity
  // chart: content_drafts.created_at alone can't tell you when a draft was actually
  // published, only when it was written.
  await p.query(`ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`);
  await p.query(`ALTER TABLE gap_runs ADD COLUMN IF NOT EXISTS content_briefs_json TEXT NOT NULL DEFAULT '[]'`);

  // Billing (Stripe) — additive. users.plan stays the single source of truth for limits;
  // these columns just let the webhook map a Stripe customer/subscription back to a user.
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`);
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`);
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT`);
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ`);
  await p.query(`CREATE INDEX IF NOT EXISTS users_stripe_customer_idx ON users (stripe_customer_id)`);

  // Campaign mode — "set it and forget it" content generation, the Arvow-style piece
  // still missing after Overview + real cron monitoring. Deliberately narrower than
  // Arvow's own autoblog though: a campaign never invents a topic. Each run pulls the
  // next not-yet-drafted content gap from this domain's most recent real Gap Analysis
  // (see getLatestGapRunBriefs) and always lands as a draft (lib/content-generator.ts's
  // existing [NEEDS: ...] / draft-only rules apply unchanged) — same review gate as a
  // manually-generated article, just triggered by GitHub Actions cron instead of a click.
  await p.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      brand_name TEXT NOT NULL,
      brand_domain TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'weekly',
      status TEXT NOT NULL DEFAULT 'active',
      last_run_at TIMESTAMPTZ,
      last_run_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
  `);
  // Autoblog — kampanyalar artık üç kaynaktan konu alabilir: Gap Analysis (varsayılan),
  // bir RSS/Atom beslemesi ya da kullanıcının yazdığı anahtar kelime kuyruğu.
  await p.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'gap'`);
  await p.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS config_json TEXT NOT NULL DEFAULT '{}'`);
  await p.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS posts_per_run INTEGER NOT NULL DEFAULT 1`);
  await p.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'article'`);
  await p.query(`ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS campaign_id INTEGER`);
  // Autoblog v2 — otomasyon modu, entegrasyon, rastgele saat, dil, kapak, içindekiler.
  await p.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'review'`);
  await p.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS options_json TEXT NOT NULL DEFAULT '{}'`);
  await p.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ`);
  // Beslemeler — birden fazla autoblog'un kullanabildiği konu kaynakları.
  await p.query(`
    CREATE TABLE IF NOT EXISTS feeds (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      items_json TEXT NOT NULL DEFAULT '[]',
      last_error TEXT,
      refreshed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_feeds_user ON feeds(user_id);
  `);
  // Sıralama takibi (SerpBear mantığı, SerpApi ile).
  await p.query(`
    CREATE TABLE IF NOT EXISTS rank_keywords (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      domain TEXT NOT NULL,
      keyword TEXT NOT NULL,
      gl TEXT NOT NULL DEFAULT 'tr',
      last_position INTEGER,
      last_url TEXT,
      last_checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, domain, keyword, gl)
    );
    CREATE TABLE IF NOT EXISTS rank_history (
      id SERIAL PRIMARY KEY,
      keyword_id INTEGER NOT NULL REFERENCES rank_keywords(id) ON DELETE CASCADE,
      position INTEGER,
      url TEXT,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_rank_history_kw ON rank_history(keyword_id, checked_at);
    ALTER TABLE rank_keywords ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'serpapi';
    CREATE TABLE IF NOT EXISTS citation_profiles (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      site TEXT NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, site)
    );
    CREATE TABLE IF NOT EXISTS citation_status (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      site TEXT NOT NULL,
      dir_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      listing_url TEXT,
      link_found BOOLEAN,
      checked_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, site, dir_id)
    );
    CREATE TABLE IF NOT EXISTS backlink_cache (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cache_key TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, cache_key)
    );
    CREATE TABLE IF NOT EXISTS user_integrations (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      secrets_json TEXT NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, provider)
    );
  `);
  // Taslak kapak görselleri (markalı ücretsiz kapak ya da AI görseli).
  await p.query(`
    CREATE TABLE IF NOT EXISTS draft_covers (
      draft_id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      mime TEXT NOT NULL,
      data BYTEA NOT NULL,
      token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Saved GEO prompts — a persistent per-brand prompt library (Prompts tab, re-run one
  // at a time) instead of the ad-hoc "type prompts, run the whole batch, results vanish
  // on reload" flow the GEO page started with. `branded` is stamped at save time via
  // isBrandedPrompt so the Prompts table can show a Type badge without re-deriving it;
  // last_* columns are null until the prompt has been run at least once.
  await p.query(`
    CREATE TABLE IF NOT EXISTS saved_prompts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      brand_name TEXT NOT NULL,
      brand_domain TEXT NOT NULL,
      competitors_json TEXT NOT NULL DEFAULT '[]',
      prompt_text TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT 'Genel',
      branded INTEGER NOT NULL DEFAULT 0,
      last_visibility INTEGER,
      last_sentiment INTEGER,
      last_mentioned INTEGER,
      last_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_saved_prompts_user_domain ON saved_prompts(user_id, brand_domain);
  `);

  // Content Hub queue — a real, persisted "what should we write next" list instead of
  // Arvow's mock-data input table. Every row must be grounded before it's created: a
  // URL for news/comparison/alternatives types (scraped, never invented — see
  // lib/content-fetch.ts), or a real Gap Analysis brief for seo-gap/listicle types
  // (brief_json, same source Campaign mode already draws from). `topic` always holds
  // the human-facing reference (the URL, or the brief's audited page URL) so the table
  // never needs a second lookup just to render a label.
  await p.query(`
    CREATE TABLE IF NOT EXISTS content_inputs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      brand_name TEXT NOT NULL,
      brand_domain TEXT NOT NULL,
      type TEXT NOT NULL,
      topic TEXT NOT NULL,
      label TEXT NOT NULL,
      brief_json TEXT,
      language TEXT NOT NULL DEFAULT 'tr',
      status TEXT NOT NULL DEFAULT 'queued',
      draft_id INTEGER,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_content_inputs_user_domain ON content_inputs(user_id, brand_domain);
  `);

  // Kart: Otomatik onboarding zinciri — durable job state for the URL-first wizard so the
  // chain (Tarama → Marka profili ‖ Rakipler → Topic'ler → Promptlar) runs server-side the
  // moment the URL is entered, without waiting on the user to click anything, and survives a
  // page refresh (the wizard just re-polls this row by id). Each step has its own
  // status/result/error instead of one shared status column, since steps run in parallel
  // (profile/competitors) and partial failure is meaningful (e.g. competitors erroring
  // shouldn't block prompts — see lib/onboarding-engine.ts).
  await p.query(`
    CREATE TABLE IF NOT EXISTS onboarding_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'tr',
      country TEXT NOT NULL DEFAULT 'Türkiye',

      crawl_status TEXT NOT NULL DEFAULT 'pending',
      crawl_result_json TEXT,
      crawl_error TEXT,

      profile_status TEXT NOT NULL DEFAULT 'pending',
      profile_result_json TEXT,
      profile_error TEXT,

      competitors_status TEXT NOT NULL DEFAULT 'pending',
      competitors_result_json TEXT,
      competitors_error TEXT,

      topics_status TEXT NOT NULL DEFAULT 'pending',
      topics_result_json TEXT,
      topics_error TEXT,

      prompts_status TEXT NOT NULL DEFAULT 'pending',
      prompts_result_json TEXT,
      prompts_error TEXT,

      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user ON onboarding_sessions(user_id);
  `);

  // Kart: Değişiklikte yeniden üretim (hash kontrolü) — the snapshot of the exact
  // (description, industry) pair topics_result_json was last generated from (as a hash,
  // never the raw text — nothing here needs to be human-readable) plus the exact
  // productTags list used, so a later "about to show the topics step" check can tell
  // apart "nothing changed" (show instantly), "description/industry changed" (full
  // regen) and "only a product was added/removed" (surgical topic+prompt patch) without
  // re-running any generation just to find out. Columns start NULL on existing rows
  // (pre-dating this card) — null hash is simply never equal to a freshly computed one,
  // so an old session in flight degrades to "treat as changed" on its first check here,
  // never a crash.
  await p.query(`ALTER TABLE onboarding_sessions ADD COLUMN IF NOT EXISTS topics_input_hash TEXT`);
  await p.query(`ALTER TABLE onboarding_sessions ADD COLUMN IF NOT EXISTS topics_input_products_json TEXT NOT NULL DEFAULT '[]'`);

  // Kart: Domain bazlı önbellek — aynı domain tekrar girilirse (demo, satış görüşmesi, aynı
  // firmadan ikinci kullanıcı) tüm zincirin (tarama→profil→rakipler→topic'ler→promptlar) son
  // başarılı çıktısı burada domain anahtarıyla saklanır; lib/onboarding-engine.ts'in
  // runOnboardingChain'i bu satırı bulursa hiçbir ağ/LLM çağrısı yapmadan doğrudan session'a
  // kopyalar. 7 günlük geçerlilik bir TTL kolonu yerine okuma anında updated_at üzerinden
  // kontrol edilir (bkz. getOnboardingDomainCache) — süresi geçmiş bir satır burada sessizce
  // yok sayılır, bir sonraki gerçek (cache'siz) çalışma onu zaten üzerine yazar.
  await p.query(`
    CREATE TABLE IF NOT EXISTS onboarding_domain_cache (
      domain TEXT PRIMARY KEY,
      crawl_result_json TEXT NOT NULL,
      profile_result_json TEXT NOT NULL,
      competitors_result_json TEXT NOT NULL,
      topics_result_json TEXT NOT NULL,
      prompts_result_json TEXT NOT NULL,
      topics_input_hash TEXT NOT NULL,
      topics_input_products_json TEXT NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
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

/** Araç sayfası panosu (/audit) — kullanıcının son denetimleri, eskiden yeniye. */
export async function listRecentAuditRuns(userId: number, limit = 120): Promise<AuditRunSummary[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT * FROM (SELECT * FROM audit_runs WHERE user_id = $1 ORDER BY id DESC LIMIT $2) r ORDER BY id ASC`,
    [userId, limit]
  );
  return rows.map(rowToAuditSummary);
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
  runs?: GeoRunResult[];
  competitors?: { name: string; domain: string }[];
}): Promise<void> {
  await ensureSchema();
  // Ham cevaplar rakip kartları ve fırsatlar için saklanır (metin kırpılır, boyut sınırlı kalsın).
  const runsJson = params.runs
    ? JSON.stringify(params.runs.map((r) => ({ ...r, responseText: r.responseText.slice(0, 2500), citations: r.citations.slice(0, 15) })))
    : null;
  await exec(
    `INSERT INTO geo_runs (user_id, brand_name, brand_domain, demo_mode, summaries_json, source_distribution_json, topic_breakdown_json, runs_json, competitors_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      userId,
      params.brandName,
      params.brandDomain,
      params.demoMode ? 1 : 0,
      JSON.stringify(params.summaries),
      JSON.stringify(params.sourceDistribution),
      JSON.stringify(params.topicBreakdown),
      runsJson,
      params.competitors ? JSON.stringify(params.competitors) : null,
    ]
  );
}

/** En son (ayrıntıları saklanmış) GEO testi — rakip kartları ve fırsatlar sekmesi için. */
export async function getLatestGeoRunFull(userId: number, brandDomain?: string): Promise<{
  createdAt: string;
  brand: { name: string; domain: string };
  competitors: { name: string; domain: string }[];
  demoMode: boolean;
  summaries: GeoVisibilitySummary[];
  sourceDistribution: SourceDomainStat[];
  topicBreakdown: TopicVisibility[];
  runs: GeoRunResult[];
} | null> {
  await ensureSchema();
  const row = await one<any>(
    `SELECT * FROM geo_runs WHERE user_id = $1 AND runs_json IS NOT NULL ${brandDomain ? "AND brand_domain = $2" : ""} ORDER BY id DESC LIMIT 1`,
    brandDomain ? [userId, brandDomain] : [userId]
  );
  if (!row) return null;
  const summaries: GeoVisibilitySummary[] = JSON.parse(row.summaries_json || "[]");
  const competitors = row.competitors_json
    ? JSON.parse(row.competitors_json)
    : summaries.filter((s) => s.domain !== row.brand_domain).map((s) => ({ name: s.brand, domain: s.domain }));
  return {
    createdAt: toIso(row.created_at),
    brand: { name: row.brand_name, domain: row.brand_domain },
    competitors,
    demoMode: !!row.demo_mode,
    summaries,
    sourceDistribution: JSON.parse(row.source_distribution_json || "[]"),
    topicBreakdown: JSON.parse(row.topic_breakdown_json || "[]"),
    runs: JSON.parse(row.runs_json || "[]"),
  };
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

/** Kart: Peec tarzı Overview (/dashboard) — kullanıcının GEO testi yaptığı markalar (en son
 * çalıştırılan önce) ve seçilen markanın son `days` gündeki tüm koşuları, kaynak dağılımı
 * dahil. Grafik/tablo/kaynak kartları hep bu gerçek geo_runs satırlarından hesaplanır. */
export interface OverviewRun {
  id: number;
  createdAt: string;
  demoMode: boolean;
  summaries: GeoVisibilitySummary[];
  sourceDistribution: SourceDomainStat[];
}

export async function listGeoBrands(userId: number): Promise<{ brandName: string; brandDomain: string; lastRunAt: string; runs: number }[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT brand_domain, (array_agg(brand_name ORDER BY id DESC))[1] AS brand_name, MAX(created_at) AS last_run_at, COUNT(*) AS runs
       FROM geo_runs WHERE user_id = $1 GROUP BY brand_domain ORDER BY MAX(created_at) DESC`,
    [userId]
  );
  return rows.map((r) => ({ brandName: r.brand_name, brandDomain: r.brand_domain, lastRunAt: toIso(r.last_run_at), runs: Number(r.runs) }));
}

export async function listGeoRunsForOverview(userId: number, brandDomain: string, days = 90): Promise<OverviewRun[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT id, created_at, demo_mode, summaries_json, source_distribution_json FROM geo_runs
      WHERE user_id = $1 AND brand_domain = $2 AND created_at >= now() - ($3 || ' days')::interval
      ORDER BY id ASC LIMIT 500`,
    [userId, brandDomain, String(days)]
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: toIso(r.created_at),
    demoMode: !!r.demo_mode,
    summaries: JSON.parse(r.summaries_json),
    sourceDistribution: r.source_distribution_json ? JSON.parse(r.source_distribution_json) : [],
  }));
}

/** SEO Asistanı için: bir alan adının son iki GEO koşusu (özet + konu kırılımı + kaynaklar). */
export async function getLatestGeoRuns(userId: number, brandDomain: string, limit = 2): Promise<{ id: number; createdAt: string; brandName: string; summaries: GeoVisibilitySummary[]; topics: { topic: string; visibility: number; mentionedCount: number; totalCount: number }[]; sources: SourceDomainStat[] }[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT id, created_at, brand_name, summaries_json, topic_breakdown_json, source_distribution_json FROM geo_runs WHERE user_id = $1 AND brand_domain = $2 ORDER BY id DESC LIMIT $3`,
    [userId, brandDomain, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: toIso(r.created_at),
    brandName: r.brand_name,
    summaries: JSON.parse(r.summaries_json || "[]"),
    topics: JSON.parse(r.topic_breakdown_json || "[]"),
    sources: JSON.parse(r.source_distribution_json || "[]"),
  }));
}

/** SEO Asistanı'nın site seçicisi: kullanıcının veri olan tüm alan adları. */
export async function listKnownSites(userId: number): Promise<string[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT d FROM (
       SELECT brand_domain AS d, MAX(created_at) AS t FROM geo_runs WHERE user_id = $1 GROUP BY brand_domain
       UNION ALL SELECT brand_domain, MAX(created_at) FROM gap_runs WHERE user_id = $1 GROUP BY brand_domain
       UNION ALL SELECT split_part(filename, ' ', 1), MAX(created_at) FROM import_runs WHERE user_id = $1 GROUP BY split_part(filename, ' ', 1)
     ) x GROUP BY d ORDER BY MAX(t) DESC LIMIT 30`,
    [userId]
  );
  return [...new Set(rows.map((r) => String(r.d).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter(Boolean))];
}

/** Bir alan adının son N site taramasının tam sonucu (en yenisi önce). */
export async function getLatestCrawls(userId: number, host: string, limit = 2): Promise<{ id: number; createdAt: string; result: BulkImportResult }[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT id, created_at, result_json FROM import_runs WHERE user_id = $1 AND (filename = $2 OR filename LIKE $3) ORDER BY id DESC LIMIT $4`,
    [userId, host, `${host} %`, limit]
  );
  return rows.map((r) => ({ id: r.id, createdAt: toIso(r.created_at), result: JSON.parse(r.result_json) }));
}

// ---------------- araç panoları (Monitoring, Kampanyalar, Yerel, Clients) ----------------

export async function monitorOverview(userId: number) {
  await ensureSchema();
  const pages = await many<any>(
    `SELECT p.id, p.url, p.label,
            (SELECT score FROM monitor_checks c WHERE c.monitored_page_id = p.id ORDER BY id DESC LIMIT 1) AS score,
            (SELECT ai_crawl_score FROM monitor_checks c WHERE c.monitored_page_id = p.id ORDER BY id DESC LIMIT 1) AS ai,
            (SELECT score FROM monitor_checks c WHERE c.monitored_page_id = p.id ORDER BY id DESC OFFSET 1 LIMIT 1) AS prev_score,
            (SELECT created_at FROM monitor_checks c WHERE c.monitored_page_id = p.id ORDER BY id DESC LIMIT 1) AS last_at,
            (SELECT COUNT(*) FROM alerts a WHERE a.monitored_page_id = p.id AND a.acknowledged = 0) AS open_alerts
       FROM monitored_pages p WHERE p.user_id = $1 ORDER BY p.id`,
    [userId]
  );
  const series = await many<any>(
    `SELECT date_trunc('day', c.created_at) AS d, ROUND(AVG(c.score)) AS score, ROUND(AVG(c.ai_crawl_score)) AS ai, COUNT(*) AS n
       FROM monitor_checks c JOIN monitored_pages p ON p.id = c.monitored_page_id
      WHERE p.user_id = $1 AND c.created_at >= now() - interval '90 days'
      GROUP BY 1 ORDER BY 1`,
    [userId]
  );
  const alerts = await many<any>(
    `SELECT date_trunc('day', a.created_at) AS d, COUNT(*) AS n FROM alerts a JOIN monitored_pages p ON p.id = a.monitored_page_id
      WHERE p.user_id = $1 AND a.created_at >= now() - interval '90 days' GROUP BY 1 ORDER BY 1`,
    [userId]
  );
  return {
    pages: pages.map((r) => ({ id: r.id, url: r.url, label: r.label, score: r.score == null ? null : Number(r.score), ai: r.ai == null ? null : Number(r.ai), prevScore: r.prev_score == null ? null : Number(r.prev_score), lastAt: r.last_at ? toIso(r.last_at) : null, openAlerts: Number(r.open_alerts) })),
    series: series.map((r) => ({ date: toIso(r.d), score: Number(r.score), ai: Number(r.ai), checks: Number(r.n) })),
    alerts: alerts.map((r) => ({ date: toIso(r.d), count: Number(r.n) })),
  };
}

export async function campaignsOverview(userId: number) {
  await ensureSchema();
  const weeks = await many<any>(
    `SELECT date_trunc('week', created_at) AS w, COUNT(*) AS n, SUM(CASE WHEN status = 'published-to-wp' THEN 1 ELSE 0 END) AS pub
       FROM content_drafts WHERE user_id = $1 AND created_at >= now() - interval '12 weeks' GROUP BY 1 ORDER BY 1`,
    [userId]
  );
  const totals = await one<any>(
    `SELECT COUNT(*) AS drafts, SUM(CASE WHEN status = 'published-to-wp' THEN 1 ELSE 0 END) AS pub,
            SUM(CASE WHEN created_at >= now() - interval '30 days' THEN 1 ELSE 0 END) AS last30
       FROM content_drafts WHERE user_id = $1`,
    [userId]
  );
  return {
    weeks: weeks.map((r) => ({ week: toIso(r.w), drafts: Number(r.n), published: Number(r.pub ?? 0) })),
    drafts: Number(totals?.drafts ?? 0),
    published: Number(totals?.pub ?? 0),
    last30: Number(totals?.last30 ?? 0),
  };
}

export async function saveLocalGeneration(userId: number, g: { kind: string; business: string; input: string; output: string; rating?: number | null }) {
  await ensureSchema();
  await exec(`INSERT INTO local_generations (user_id, kind, business, input, output, rating) VALUES ($1, $2, $3, $4, $5, $6)`, [userId, g.kind, g.business, g.input.slice(0, 2000), g.output.slice(0, 4000), g.rating ?? null]);
}

export async function localOverview(userId: number) {
  await ensureSchema();
  const weeks = await many<any>(
    `SELECT date_trunc('week', created_at) AS w, SUM(CASE WHEN kind = 'gbp-post' THEN 1 ELSE 0 END) AS posts, SUM(CASE WHEN kind = 'review-reply' THEN 1 ELSE 0 END) AS replies
       FROM local_generations WHERE user_id = $1 AND created_at >= now() - interval '12 weeks' GROUP BY 1 ORDER BY 1`,
    [userId]
  );
  const ratings = await many<any>(`SELECT rating, COUNT(*) AS n FROM local_generations WHERE user_id = $1 AND kind = 'review-reply' AND rating IS NOT NULL GROUP BY rating`, [userId]);
  const recent = await many<any>(`SELECT id, kind, business, input, output, rating, created_at FROM local_generations WHERE user_id = $1 ORDER BY id DESC LIMIT 8`, [userId]);
  const totals = await one<any>(
    `SELECT SUM(CASE WHEN kind = 'gbp-post' THEN 1 ELSE 0 END) AS posts, SUM(CASE WHEN kind = 'review-reply' THEN 1 ELSE 0 END) AS replies, COUNT(DISTINCT business) AS businesses
       FROM local_generations WHERE user_id = $1`,
    [userId]
  );
  return {
    weeks: weeks.map((r) => ({ week: toIso(r.w), posts: Number(r.posts ?? 0), replies: Number(r.replies ?? 0) })),
    ratings: Object.fromEntries(ratings.map((r) => [String(r.rating), Number(r.n)])) as Record<string, number>,
    recent: recent.map((r) => ({ id: r.id, kind: r.kind, business: r.business, input: r.input, output: r.output, rating: r.rating, createdAt: toIso(r.created_at) })),
    posts: Number(totals?.posts ?? 0),
    replies: Number(totals?.replies ?? 0),
    businesses: Number(totals?.businesses ?? 0),
  };
}

/** Ajans portföy panosu: her müşterinin son SEO, site sağlığı ve AI görünürlüğü. */
export async function clientsOverview(userId: number) {
  await ensureSchema();
  const clients = await many<any>(`SELECT id, name, domain FROM clients WHERE user_id = $1 ORDER BY id`, [userId]);
  const out = [];
  for (const c of clients) {
    const host = String(c.domain).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    const like = `%${host}%`;
    const audit = await one<any>(`SELECT score, ai_crawl_score, created_at FROM audit_runs WHERE user_id = $1 AND url LIKE $2 ORDER BY id DESC LIMIT 1`, [userId, like]);
    const crawl = await one<any>(`SELECT summary_json, row_count, created_at FROM import_runs WHERE user_id = $1 AND (filename = $2 OR filename LIKE $3) ORDER BY id DESC LIMIT 1`, [userId, host, `${host} %`]);
    const geo = await many<any>(`SELECT summaries_json, created_at FROM geo_runs WHERE user_id = $1 AND brand_domain LIKE $2 ORDER BY id DESC LIMIT 8`, [userId, like]);
    const vis = geo
      .map((g) => {
        const sums: GeoVisibilitySummary[] = JSON.parse(g.summaries_json || "[]");
        const me = sums.find((s) => String(s.domain).includes(host)) ?? sums[0];
        return me ? { date: toIso(g.created_at), visibility: Math.round(me.visibility * 100) } : null;
      })
      .filter(Boolean)
      .reverse() as { date: string; visibility: number }[];
    const cs = crawl ? JSON.parse(crawl.summary_json) : null;
    out.push({
      id: c.id,
      name: c.name,
      domain: host,
      seoScore: audit ? Number(audit.score) : null,
      axoScore: audit ? Number(audit.ai_crawl_score) : null,
      health: cs?.healthScore ?? null,
      pages: crawl ? Number(crawl.row_count) : null,
      errors: cs?.severity?.error ?? null,
      visibility: vis.length ? vis[vis.length - 1].visibility : null,
      visibilityTrend: vis,
      lastActivity: [audit?.created_at, crawl?.created_at, geo[0]?.created_at].filter(Boolean).map((d: any) => toIso(d)).sort().pop() ?? null,
    });
  }
  return { clients: out };
}

// ---------------- gap runs ----------------

export async function saveGapRun(userId: number, params: {
  brandName: string;
  brandDomain: string;
  demoMode: boolean;
  gapMatrix: GapRow[];
  summaries: GeoVisibilitySummary[];
  /** Persisted (unlike the raw per-prompt GeoRunResult[] this is built from) so a
   * Campaign — running unattended, days later — can pick a real, already-computed
   * content gap without re-running the whole GEO fan-out just to get one topic. */
  contentBriefs: ContentBrief[];
}): Promise<void> {
  await ensureSchema();
  await exec(
    `INSERT INTO gap_runs (user_id, brand_name, brand_domain, gap_matrix_json, summaries_json, content_briefs_json, demo_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userId,
      params.brandName,
      params.brandDomain,
      JSON.stringify(params.gapMatrix),
      JSON.stringify(params.summaries),
      JSON.stringify(params.contentBriefs),
      params.demoMode ? 1 : 0,
    ]
  );
}

/** /gap panosu — kullanıcının son Gap Analysis koşuları (eskiden yeniye), satır matrisiyle. */
export async function listRecentGapRuns(userId: number, limit = 60): Promise<{ id: number; brandName: string; brandDomain: string; demoMode: boolean; gapMatrix: GapRow[]; createdAt: string }[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT * FROM (SELECT id, brand_name, brand_domain, demo_mode, gap_matrix_json, created_at FROM gap_runs WHERE user_id = $1 ORDER BY id DESC LIMIT $2) r ORDER BY id ASC`,
    [userId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    brandName: r.brand_name,
    brandDomain: r.brand_domain,
    demoMode: !!r.demo_mode,
    gapMatrix: JSON.parse(r.gap_matrix_json || "[]"),
    createdAt: toIso(r.created_at),
  }));
}

/** Most recent Gap Analysis content briefs for this brand domain — what a Campaign
 * draws its next topic from. Null when Gap Analysis has never been run for it. */
export async function getLatestGapRunBriefs(
  userId: number,
  brandDomain: string
): Promise<{ gapRunId: number; contentBriefs: ContentBrief[] } | null> {
  await ensureSchema();
  const row = await one<any>(
    `SELECT id, content_briefs_json FROM gap_runs WHERE user_id = $1 AND brand_domain = $2 ORDER BY id DESC LIMIT 1`,
    [userId, brandDomain]
  );
  if (!row) return null;
  return { gapRunId: row.id, contentBriefs: JSON.parse(row.content_briefs_json || "[]") };
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
// auth_secret is stored as plain text, same as monitored_pages.slack_webhook above — for
// WordPress it's a scoped, individually-revocable "Application Password" (not the user's
// real WP login); for Shopify it's a Custom App Admin API access token, also scoped and
// revocable from the merchant's own Shopify admin. Same risk class as the webhook URLs
// already stored this way. list/getMasked never return the raw value to the client —
// only the publish flow (server-side only) reads it in full.

function maskSecret(secret: string): string {
  if (secret.length <= 4) return "••••";
  return `••••${secret.slice(-4)}`;
}

function rowToCmsConnection(row: any): CmsConnection {
  return {
    id: row.id,
    platform: row.platform,
    label: row.label,
    siteUrl: row.site_url,
    authIdentifier: row.auth_identifier,
    authSecretMasked: maskSecret(row.auth_secret),
    createdAt: toIso(row.created_at),
  };
}

export async function createCmsConnection(userId: number, params: {
  platform: CmsPlatform;
  label: string;
  siteUrl: string;
  authIdentifier: string;
  authSecret: string;
}): Promise<CmsConnection> {
  await ensureSchema();
  const row = await one<any>(
    `INSERT INTO cms_connections (user_id, platform, label, site_url, auth_identifier, auth_secret) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, params.platform, params.label, params.siteUrl, params.authIdentifier, params.authSecret]
  );
  return rowToCmsConnection(row);
}

export async function listCmsConnections(userId: number): Promise<CmsConnection[]> {
  await ensureSchema();
  const rows = await many<any>(`SELECT * FROM cms_connections WHERE user_id = $1 ORDER BY id DESC`, [userId]);
  return rows.map(rowToCmsConnection);
}

/** Server-side only (publish flow) — includes the raw secret. Never send this to the client. */
export interface CmsConnectionSecret {
  id: number;
  platform: CmsPlatform;
  siteUrl: string;
  authIdentifier: string;
  authSecret: string;
}

export async function getCmsConnectionSecret(userId: number, id: number): Promise<CmsConnectionSecret | null> {
  await ensureSchema();
  const row = await one<any>(`SELECT * FROM cms_connections WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!row) return null;
  return { id: row.id, platform: row.platform, siteUrl: row.site_url, authIdentifier: row.auth_identifier, authSecret: row.auth_secret };
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

export async function saveContentDraft(userId: number, sourceUrl: string, article: GeneratedArticle, campaignId?: number | null): Promise<ContentDraft> {
  await ensureSchema();
  const row = await one<any>(
    `INSERT INTO content_drafts (user_id, source_url, article_json, campaign_id) VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, sourceUrl, JSON.stringify(article), campaignId ?? null]
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

/** Marka bilgi bankası — AI yazarken "kesin doğru" kabul edilen marka bilgileri. */
export async function getBrandKnowledge(userId: number): Promise<{ content: string; updatedAt: string | null }> {
  await ensureSchema();
  const row = await one<any>(`SELECT content, updated_at FROM brand_knowledge WHERE user_id = $1`, [userId]);
  return { content: row?.content ?? "", updatedAt: row ? toIso(row.updated_at) : null };
}

export async function saveBrandKnowledge(userId: number, content: string): Promise<void> {
  await ensureSchema();
  await exec(
    `INSERT INTO brand_knowledge (user_id, content, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
    [userId, content]
  );
}

/** AI SEO Editör'de düzenlenen taslağın makalesini günceller (sahiplik kontrollü). */
export async function updateContentDraftArticle(userId: number, id: number, article: GeneratedArticle): Promise<ContentDraft | null> {
  await ensureSchema();
  const row = await one<any>(
    `UPDATE content_drafts SET article_json = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
    [JSON.stringify(article), id, userId]
  );
  return row ? rowToContentDraft(row) : null;
}

/** Bir alan adı için en son Site Taraması'nın sayfaları (editörde iç link önerisi için). */
export async function getLatestCrawlPages(userId: number, host: string): Promise<{ url: string; title: string | null; h1: string | null }[]> {
  await ensureSchema();
  const row = await one<any>(
    `SELECT result_json FROM import_runs WHERE user_id = $1 AND (filename = $2 OR filename LIKE $3) ORDER BY id DESC LIMIT 1`,
    [userId, host, `${host} %`]
  );
  if (!row) return [];
  const r = JSON.parse(row.result_json);
  return (r.rows ?? [])
    .filter((x: any) => x.statusCode >= 200 && x.statusCode < 300 && x.indexable !== false)
    .map((x: any) => ({ url: x.url, title: x.title ?? null, h1: x.h1 ?? null }));
}

/** Ownership-checked — only marks the draft published if the calling user actually owns it. */
export async function markDraftPublished(userId: number, id: number, params: { connectionId: number; postUrl: string; editUrl: string }): Promise<void> {
  await ensureSchema();
  await exec(
    `UPDATE content_drafts SET status = 'published-to-wp', published_connection_id = $1, published_post_url = $2, published_edit_url = $3, published_at = now()
     WHERE id = $4 AND user_id = $5`,
    [params.connectionId, params.postUrl, params.editUrl, id, userId]
  );
}

// ---------------- dashboard overview ----------------

export interface DashboardSummary {
  activeServices: { monitoredPages: number; cmsConnections: number; clients: number };
  totals: {
    auditRuns: number;
    geoRuns: number;
    gapRuns: number;
    importRuns: number;
    contentDrafts: number;
    contentPublished: number;
  };
  thisMonth: { auditRuns: number; geoRuns: number; contentGenerated: number; contentPublished: number };
  activeAlerts: number;
  /** Last 14 days, zero-filled — mirrors the "Generated vs Published" trend line pattern. */
  activity: { date: string; generated: number; published: number }[];
}

function countOf(row: { count?: string } | null): number {
  return Number(row?.count ?? 0);
}

/**
 * One aggregate read for the Overview page — every number here is a real COUNT(*)
 * against this user's own rows, nothing estimated or simulated (unlike audit/GEO
 * runs, there's no "demo mode" concept for a dashboard: it's just what's actually in
 * the database, which for a brand-new account is honestly all zeroes).
 */
export async function getDashboardSummary(userId: number): Promise<DashboardSummary> {
  await ensureSchema();

  const [
    monitoredPages,
    cmsConnections,
    clients,
    auditRuns,
    geoRuns,
    gapRuns,
    importRuns,
    contentDrafts,
    contentPublished,
    auditRunsMonth,
    geoRunsMonth,
    contentGeneratedMonth,
    contentPublishedMonth,
    activeAlerts,
    activity,
  ] = await Promise.all([
    one<{ count: string }>(`SELECT COUNT(*) FROM monitored_pages WHERE user_id = $1`, [userId]),
    one<{ count: string }>(`SELECT COUNT(*) FROM cms_connections WHERE user_id = $1`, [userId]),
    one<{ count: string }>(`SELECT COUNT(*) FROM clients WHERE user_id = $1`, [userId]),
    one<{ count: string }>(`SELECT COUNT(*) FROM audit_runs WHERE user_id = $1`, [userId]),
    one<{ count: string }>(`SELECT COUNT(*) FROM geo_runs WHERE user_id = $1`, [userId]),
    one<{ count: string }>(`SELECT COUNT(*) FROM gap_runs WHERE user_id = $1`, [userId]),
    one<{ count: string }>(`SELECT COUNT(*) FROM import_runs WHERE user_id = $1`, [userId]),
    one<{ count: string }>(`SELECT COUNT(*) FROM content_drafts WHERE user_id = $1`, [userId]),
    one<{ count: string }>(`SELECT COUNT(*) FROM content_drafts WHERE user_id = $1 AND status <> 'draft'`, [userId]),
    one<{ count: string }>(
      `SELECT COUNT(*) FROM audit_runs WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
      [userId]
    ),
    one<{ count: string }>(
      `SELECT COUNT(*) FROM geo_runs WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
      [userId]
    ),
    one<{ count: string }>(
      `SELECT COUNT(*) FROM content_drafts WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
      [userId]
    ),
    one<{ count: string }>(
      `SELECT COUNT(*) FROM content_drafts WHERE user_id = $1 AND published_at >= date_trunc('month', now())`,
      [userId]
    ),
    one<{ count: string }>(
      `SELECT COUNT(*) FROM alerts a JOIN monitored_pages mp ON mp.id = a.monitored_page_id WHERE mp.user_id = $1 AND a.acknowledged = 0`,
      [userId]
    ),
    many<{ date: string; generated: string; published: string }>(
      `WITH days AS (
         SELECT generate_series(current_date - interval '13 days', current_date, interval '1 day')::date AS day
       )
       SELECT
         to_char(days.day, 'YYYY-MM-DD') AS date,
         COUNT(DISTINCT CASE WHEN cd.created_at::date = days.day THEN cd.id END) AS generated,
         COUNT(DISTINCT CASE WHEN cd.published_at::date = days.day THEN cd.id END) AS published
       FROM days
       LEFT JOIN content_drafts cd ON cd.user_id = $1
       GROUP BY days.day
       ORDER BY days.day`,
      [userId]
    ),
  ]);

  return {
    activeServices: {
      monitoredPages: countOf(monitoredPages),
      cmsConnections: countOf(cmsConnections),
      clients: countOf(clients),
    },
    totals: {
      auditRuns: countOf(auditRuns),
      geoRuns: countOf(geoRuns),
      gapRuns: countOf(gapRuns),
      importRuns: countOf(importRuns),
      contentDrafts: countOf(contentDrafts),
      contentPublished: countOf(contentPublished),
    },
    thisMonth: {
      auditRuns: countOf(auditRunsMonth),
      geoRuns: countOf(geoRunsMonth),
      contentGenerated: countOf(contentGeneratedMonth),
      contentPublished: countOf(contentPublishedMonth),
    },
    activeAlerts: countOf(activeAlerts),
    activity: activity.map((r) => ({
      date: r.date,
      generated: Number(r.generated ?? 0),
      published: Number(r.published ?? 0),
    })),
  };
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

// ---------------- billing (Stripe) ----------------

export interface BillingInfo {
  plan: string;
  email: string;
  stripeCustomerId: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
}

export async function getBillingInfo(userId: number): Promise<BillingInfo | null> {
  await ensureSchema();
  const row = await one<any>(
    `SELECT plan, email, stripe_customer_id, subscription_status, current_period_end FROM users WHERE id = $1`,
    [userId]
  );
  if (!row) return null;
  return {
    plan: row.plan ?? "free",
    email: row.email,
    stripeCustomerId: row.stripe_customer_id ?? null,
    subscriptionStatus: row.subscription_status ?? null,
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
  };
}

export async function setStripeCustomerId(userId: number, customerId: string): Promise<void> {
  await ensureSchema();
  await exec(`UPDATE users SET stripe_customer_id = $2 WHERE id = $1`, [userId, customerId]);
}

/**
 * Applied by the webhook. Matches on stripe_customer_id first, then falls back to the
 * user id carried in Stripe metadata (first checkout, before the id was stored).
 */
export async function applySubscriptionState(opts: {
  customerId: string;
  userId?: number | null;
  plan: string;
  subscriptionId: string | null;
  status: string | null;
  currentPeriodEnd: Date | null;
}): Promise<number> {
  await ensureSchema();
  const res = await getPool().query(
    `UPDATE users
        SET plan = $3, stripe_subscription_id = $4, subscription_status = $5, current_period_end = $6,
            stripe_customer_id = COALESCE(stripe_customer_id, $1)
      WHERE stripe_customer_id = $1 OR ($2::int IS NOT NULL AND id = $2::int)`,
    [opts.customerId, opts.userId ?? null, opts.plan, opts.subscriptionId, opts.status, opts.currentPeriodEnd]
  );
  return res.rowCount ?? 0;
}

// ---------------- campaigns (automatic, grounded content generation) ----------------

export type CampaignFrequency = "daily" | "weekly" | "monthly";
export type CampaignStatus = "active" | "paused";
export type CampaignSource = "gap" | "rss" | "keywords" | "feed";
export type CampaignFormat = "article" | "listicle";

export interface CampaignConfig {
  /** RSS/Atom besleme adresi (ya da beslemesini otomatik bulacağımız site adresi). */
  rssUrl?: string;
  /** Yalnızca başlığında bu kelimelerden biri geçen besleme öğelerini kullan (boşsa hepsi). */
  rssFilter?: string[];
  /** Anahtar kelime kuyruğu — sırayla kullanılır. */
  keywords?: string[];
  /** Kayıtlı besleme (source = "feed"). */
  feedId?: number;
}

export type CampaignMode = "review" | "cms-draft" | "publish";

export interface CampaignOptions {
  /** Yayın modu "review" dışındaysa yazının gönderileceği CMS bağlantısı. */
  connectionId?: number | null;
  /** Bir sonraki çalışmaya eklenecek rastgele gecikme (dakika, 0 = yok). */
  randomMinutes?: number;
  /** Yazı dili, ör. "tr", "en". */
  language?: string;
  /** Kapak görseli: yok, markalı (ücretsiz), AI görseli (ücretli). */
  cover?: "none" | "branded" | "ai";
  /** Başa otomatik içindekiler listesi ekle. */
  toc?: boolean;
  /** "Öne çıkanlar" maddeleri ekle. */
  takeaways?: boolean;
  /** Sitede taslak / tam otomasyon modunda: alıntılanabilirlik puanı bunun altındaysa siteye gönderme (0 = kapalı). */
  minCitability?: number;
}

export interface Campaign {
  id: number;
  userId: number;
  brandName: string;
  brandDomain: string;
  frequency: CampaignFrequency;
  status: CampaignStatus;
  source: CampaignSource;
  config: CampaignConfig;
  postsPerRun: number;
  format: CampaignFormat;
  mode: CampaignMode;
  options: CampaignOptions;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunNote: string | null;
  createdAt: string;
}

function rowToCampaign(row: any): Campaign {
  let config: CampaignConfig = {};
  try {
    config = JSON.parse(row.config_json || "{}");
  } catch {
    config = {};
  }
  return {
    id: row.id,
    userId: row.user_id,
    brandName: row.brand_name,
    brandDomain: row.brand_domain,
    frequency: row.frequency,
    status: row.status,
    source: (row.source ?? "gap") as CampaignSource,
    config,
    postsPerRun: Number(row.posts_per_run ?? 1),
    format: (row.format ?? "article") as CampaignFormat,
    mode: (row.mode ?? "review") as CampaignMode,
    options: safeJson(row.options_json, {}),
    nextRunAt: row.next_run_at ? toIso(row.next_run_at) : null,
    lastRunAt: row.last_run_at ? toIso(row.last_run_at) : null,
    lastRunNote: row.last_run_note,
    createdAt: toIso(row.created_at),
  };
}

export interface CampaignInput {
  brandName: string;
  brandDomain: string;
  frequency: CampaignFrequency;
  source: CampaignSource;
  config: CampaignConfig;
  postsPerRun: number;
  format: CampaignFormat;
  mode: CampaignMode;
  options: CampaignOptions;
}

function safeJson<T>(text: string | null | undefined, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function createCampaign(userId: number, params: CampaignInput): Promise<Campaign> {
  await ensureSchema();
  const row = await one<any>(
    `INSERT INTO campaigns (user_id, brand_name, brand_domain, frequency, source, config_json, posts_per_run, format, mode, options_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [userId, params.brandName, params.brandDomain, params.frequency, params.source, JSON.stringify(params.config ?? {}), params.postsPerRun, params.format, params.mode, JSON.stringify(params.options ?? {})]
  );
  return rowToCampaign(row);
}

export async function updateCampaign(userId: number, id: number, params: CampaignInput): Promise<void> {
  await ensureSchema();
  await exec(
    `UPDATE campaigns SET brand_name = $1, brand_domain = $2, frequency = $3, source = $4, config_json = $5, posts_per_run = $6, format = $7,
            mode = $8, options_json = $9, next_run_at = NULL
      WHERE id = $10 AND user_id = $11`,
    [params.brandName, params.brandDomain, params.frequency, params.source, JSON.stringify(params.config ?? {}), params.postsPerRun, params.format, params.mode, JSON.stringify(params.options ?? {}), id, userId]
  );
}

export async function listCampaigns(userId: number): Promise<Campaign[]> {
  await ensureSchema();
  const rows = await many<any>(`SELECT * FROM campaigns WHERE user_id = $1 ORDER BY id DESC`, [userId]);
  return rows.map(rowToCampaign);
}

/** Her kampanyanın ürettiği taslak sayısı ve son taslağı — kampanya kartlarında gösterilir. */
export async function campaignDraftStats(
  userId: number
): Promise<Record<number, { count: number; last: { id: number; title: string; sourceUrl: string; createdAt: string; citability: number | null } | null }>> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT DISTINCT ON (campaign_id) campaign_id, id, source_url, article_json, created_at,
            COUNT(*) OVER (PARTITION BY campaign_id) AS n
       FROM content_drafts WHERE user_id = $1 AND campaign_id IS NOT NULL
      ORDER BY campaign_id, id DESC`,
    [userId]
  );
  const out: Record<number, { count: number; last: { id: number; title: string; sourceUrl: string; createdAt: string; citability: number | null } | null }> = {};
  for (const r of rows) {
    let title = r.source_url;
    let citability: number | null = null;
    try {
      const a = JSON.parse(r.article_json);
      title = a.title || title;
      citability = citabilityOfMarkdown(a.bodyMarkdown ?? "").score;
    } catch {
      /* başlık okunamazsa kaynak adresi göster */
    }
    out[r.campaign_id] = { count: Number(r.n), last: { id: r.id, title, sourceUrl: r.source_url, createdAt: toIso(r.created_at), citability } };
  }
  return out;
}

/** Autoblog anahtar kelime fikirleri — AI kullanmadan, kullanıcının kendi verisinden:
 * son Gap Analysis'teki hedef sorular ve bu domain için kayıtlı GEO promptları. */
export async function campaignKeywordIdeas(userId: number, brandDomain: string): Promise<string[]> {
  await ensureSchema();
  const ideas: string[] = [];
  const gap = await getLatestGapRunBriefs(userId, brandDomain);
  for (const b of gap?.contentBriefs ?? []) for (const q of b.targetQuestions ?? []) ideas.push(q);
  const prompts = await many<{ prompt_text: string }>(
    `SELECT prompt_text FROM saved_prompts WHERE user_id = $1 AND brand_domain = $2 ORDER BY id DESC LIMIT 40`,
    [userId, brandDomain]
  );
  for (const r of prompts) ideas.push(r.prompt_text);
  const seen = new Set<string>();
  return ideas
    .map((x) => x.trim())
    .filter((x) => x && x.length <= 160 && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
    .slice(0, 30);
}

/** Every active campaign across every user — the cron sweep's input (mirrors
 * listAllMonitoredPages), never scoped by a signed-in session. */
export async function listAllActiveCampaigns(): Promise<Campaign[]> {
  await ensureSchema();
  const rows = await many<any>(`SELECT * FROM campaigns WHERE status = 'active'`);
  return rows.map(rowToCampaign);
}

export async function setCampaignStatus(userId: number, id: number, status: CampaignStatus): Promise<void> {
  await ensureSchema();
  await exec(`UPDATE campaigns SET status = $1 WHERE id = $2 AND user_id = $3`, [status, id, userId]);
}

export async function deleteCampaign(userId: number, id: number): Promise<void> {
  await ensureSchema();
  await exec(`DELETE FROM campaigns WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function markCampaignRun(id: number, note: string, nextRunAt?: Date | null): Promise<void> {
  await ensureSchema();
  await exec(`UPDATE campaigns SET last_run_at = now(), last_run_note = $1, next_run_at = $2 WHERE id = $3`, [note, nextRunAt ?? null, id]);
}

// ---------------- beslemeler (autoblog konu kaynakları) ----------------

export type FeedKind = "keyword" | "news" | "rss" | "youtube";

export interface FeedConfig {
  // keyword
  siteUrl?: string;
  seeds?: string[];
  competitors?: string[];
  country?: string;
  language?: string;
  // news
  query?: string;
  // rss / youtube
  url?: string;
  filter?: string[];
}

export interface FeedEntry {
  /** content_drafts.source_url ile eşleşen benzersiz anahtar (keyword:… ya da bağlantı). */
  key: string;
  title: string;
  link?: string;
  summary?: string;
  publishedAt?: string | null;
  source?: string;
  addedAt?: string;
}

export interface Feed {
  id: number;
  userId: number;
  kind: FeedKind;
  name: string;
  config: FeedConfig;
  items: FeedEntry[];
  lastError: string | null;
  refreshedAt: string | null;
  createdAt: string;
}

function rowToFeed(row: any): Feed {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    name: row.name,
    config: safeJson(row.config_json, {}),
    items: safeJson(row.items_json, []),
    lastError: row.last_error,
    refreshedAt: row.refreshed_at ? toIso(row.refreshed_at) : null,
    createdAt: toIso(row.created_at),
  };
}

export async function listFeeds(userId: number): Promise<Feed[]> {
  await ensureSchema();
  return (await many<any>(`SELECT * FROM feeds WHERE user_id = $1 ORDER BY id DESC`, [userId])).map(rowToFeed);
}

export async function getFeed(userId: number, id: number): Promise<Feed | null> {
  await ensureSchema();
  const row = await one<any>(`SELECT * FROM feeds WHERE id = $1 AND user_id = $2`, [id, userId]);
  return row ? rowToFeed(row) : null;
}

export async function createFeed(userId: number, p: { kind: FeedKind; name: string; config: FeedConfig }): Promise<Feed> {
  await ensureSchema();
  const row = await one<any>(`INSERT INTO feeds (user_id, kind, name, config_json) VALUES ($1, $2, $3, $4) RETURNING *`, [userId, p.kind, p.name, JSON.stringify(p.config)]);
  return rowToFeed(row);
}

export async function updateFeedConfig(userId: number, id: number, p: { name: string; config: FeedConfig }): Promise<void> {
  await ensureSchema();
  await exec(`UPDATE feeds SET name = $1, config_json = $2 WHERE id = $3 AND user_id = $4`, [p.name, JSON.stringify(p.config), id, userId]);
}

export async function saveFeedItems(id: number, items: FeedEntry[], error: string | null): Promise<void> {
  await ensureSchema();
  if (error) {
    await exec(`UPDATE feeds SET last_error = $1, refreshed_at = now() WHERE id = $2`, [error, id]);
  } else {
    await exec(`UPDATE feeds SET items_json = $1, last_error = NULL, refreshed_at = now() WHERE id = $2`, [JSON.stringify(items), id]);
  }
}

export async function deleteFeed(userId: number, id: number): Promise<void> {
  await ensureSchema();
  await exec(`DELETE FROM feeds WHERE id = $1 AND user_id = $2`, [id, userId]);
}

// ---------------- taslak kapak görselleri ----------------

export async function saveDraftCover(userId: number, draftId: number, kind: string, mime: string, data: Buffer): Promise<string> {
  await ensureSchema();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  await exec(
    `INSERT INTO draft_covers (draft_id, user_id, kind, mime, data, token) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (draft_id) DO UPDATE SET kind = EXCLUDED.kind, mime = EXCLUDED.mime, data = EXCLUDED.data, token = EXCLUDED.token, created_at = now()`,
    [draftId, userId, kind, mime, data, token]
  );
  return token;
}

export async function getDraftCover(draftId: number): Promise<{ userId: number; kind: string; mime: string; data: Buffer; token: string } | null> {
  await ensureSchema();
  const row = await one<any>(`SELECT * FROM draft_covers WHERE draft_id = $1`, [draftId]);
  return row ? { userId: row.user_id, kind: row.kind, mime: row.mime, data: row.data, token: row.token } : null;
}

export async function listDraftCoverIds(userId: number): Promise<Set<number>> {
  await ensureSchema();
  const rows = await many<{ draft_id: number }>(`SELECT draft_id FROM draft_covers WHERE user_id = $1`, [userId]);
  return new Set(rows.map((r) => r.draft_id));
}

/** Every URL this user has ever generated a content draft for — a campaign skips
 * these when picking its next topic, whether the draft came from a manual "Generate
 * article" click or an earlier campaign run. */
export async function listUsedContentUrls(userId: number): Promise<Set<string>> {
  await ensureSchema();
  const rows = await many<{ source_url: string }>(`SELECT DISTINCT source_url FROM content_drafts WHERE user_id = $1`, [userId]);
  return new Set(rows.map((r) => r.source_url));
}

// ---------------- saved prompts (persistent per-brand GEO prompt library) ----------------

export interface SavedPrompt {
  id: number;
  userId: number;
  brandName: string;
  brandDomain: string;
  competitors: { name: string; domain: string }[];
  promptText: string;
  topic: string;
  branded: boolean;
  lastVisibility: number | null; // 0-100, % of the engines it was last tested against that mentioned the brand
  lastSentiment: number | null; // 0-100, averaged across engines where sentiment could be scored
  lastMentioned: boolean | null;
  lastRunAt: string | null;
  createdAt: string;
}

function rowToSavedPrompt(row: any): SavedPrompt {
  return {
    id: row.id,
    userId: row.user_id,
    brandName: row.brand_name,
    brandDomain: row.brand_domain,
    competitors: JSON.parse(row.competitors_json),
    promptText: row.prompt_text,
    topic: row.topic,
    branded: row.branded === 1,
    lastVisibility: row.last_visibility,
    lastSentiment: row.last_sentiment,
    lastMentioned: row.last_mentioned == null ? null : row.last_mentioned === 1,
    lastRunAt: row.last_run_at ? toIso(row.last_run_at) : null,
    createdAt: toIso(row.created_at),
  };
}

export async function createSavedPrompts(
  userId: number,
  params: {
    brandName: string;
    brandDomain: string;
    competitors: { name: string; domain: string }[];
    prompts: { text: string; topic: string; branded: boolean }[];
  }
): Promise<SavedPrompt[]> {
  await ensureSchema();
  const competitorsJson = JSON.stringify(params.competitors);
  const rows = await Promise.all(
    params.prompts.map((p) =>
      one<any>(
        `INSERT INTO saved_prompts (user_id, brand_name, brand_domain, competitors_json, prompt_text, topic, branded)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [userId, params.brandName, params.brandDomain, competitorsJson, p.text, p.topic, p.branded ? 1 : 0]
      )
    )
  );
  return rows.map(rowToSavedPrompt);
}

export async function listSavedPrompts(userId: number, brandDomain: string): Promise<SavedPrompt[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT * FROM saved_prompts WHERE user_id = $1 AND brand_domain = $2 ORDER BY id DESC`,
    [userId, brandDomain]
  );
  return rows.map(rowToSavedPrompt);
}

export async function getSavedPrompt(userId: number, id: number): Promise<SavedPrompt | null> {
  await ensureSchema();
  const row = await one<any>(`SELECT * FROM saved_prompts WHERE id = $1 AND user_id = $2`, [id, userId]);
  return row ? rowToSavedPrompt(row) : null;
}

export async function deleteSavedPrompt(userId: number, id: number): Promise<void> {
  await ensureSchema();
  await exec(`DELETE FROM saved_prompts WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function updateSavedPromptResult(
  userId: number,
  id: number,
  result: { visibility: number; sentiment: number | null; mentioned: boolean }
): Promise<SavedPrompt | null> {
  await ensureSchema();
  const row = await one<any>(
    `UPDATE saved_prompts SET last_visibility = $1, last_sentiment = $2, last_mentioned = $3, last_run_at = now()
     WHERE id = $4 AND user_id = $5 RETURNING *`,
    [result.visibility, result.sentiment, result.mentioned ? 1 : 0, id, userId]
  );
  return row ? rowToSavedPrompt(row) : null;
}

// ---------------- content hub (grounded content-input queue) ----------------

export type ContentInputType = "seo-gap" | "listicle" | "news" | "comparison" | "alternatives";
export type ContentInputStatus = "queued" | "drafted" | "failed";

export interface ContentInput {
  id: number;
  userId: number;
  brandName: string;
  brandDomain: string;
  type: ContentInputType;
  topic: string;
  label: string;
  brief: ContentBrief | null;
  language: string;
  status: ContentInputStatus;
  draftId: number | null;
  error: string | null;
  createdAt: string;
}

function rowToContentInput(row: any): ContentInput {
  return {
    id: row.id,
    userId: row.user_id,
    brandName: row.brand_name,
    brandDomain: row.brand_domain,
    type: row.type,
    topic: row.topic,
    label: row.label,
    brief: row.brief_json ? JSON.parse(row.brief_json) : null,
    language: row.language,
    status: row.status,
    draftId: row.draft_id,
    error: row.error,
    createdAt: toIso(row.created_at),
  };
}

export async function createContentInput(
  userId: number,
  params: {
    brandName: string;
    brandDomain: string;
    type: ContentInputType;
    topic: string;
    label: string;
    brief?: ContentBrief;
    language?: string;
  }
): Promise<ContentInput> {
  await ensureSchema();
  const row = await one<any>(
    `INSERT INTO content_inputs (user_id, brand_name, brand_domain, type, topic, label, brief_json, language)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      userId,
      params.brandName,
      params.brandDomain,
      params.type,
      params.topic,
      params.label,
      params.brief ? JSON.stringify(params.brief) : null,
      params.language ?? "tr",
    ]
  );
  return rowToContentInput(row);
}

export async function listContentInputs(userId: number, brandDomain: string): Promise<ContentInput[]> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT * FROM content_inputs WHERE user_id = $1 AND brand_domain = $2 ORDER BY id DESC`,
    [userId, brandDomain]
  );
  return rows.map(rowToContentInput);
}

export async function getContentInput(userId: number, id: number): Promise<ContentInput | null> {
  await ensureSchema();
  const row = await one<any>(`SELECT * FROM content_inputs WHERE id = $1 AND user_id = $2`, [id, userId]);
  return row ? rowToContentInput(row) : null;
}

export async function deleteContentInput(userId: number, id: number): Promise<void> {
  await ensureSchema();
  await exec(`DELETE FROM content_inputs WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function markContentInputDrafted(userId: number, id: number, draftId: number): Promise<void> {
  await ensureSchema();
  await exec(
    `UPDATE content_inputs SET status = 'drafted', draft_id = $1, error = NULL WHERE id = $2 AND user_id = $3`,
    [draftId, id, userId]
  );
}

export async function markContentInputFailed(userId: number, id: number, error: string): Promise<void> {
  await ensureSchema();
  await exec(`UPDATE content_inputs SET status = 'failed', error = $1 WHERE id = $2 AND user_id = $3`, [error, id, userId]);
}

// ---------------- onboarding_sessions (Kart: Otomatik onboarding zinciri) ----------------

export type OnboardingStepName = "crawl" | "profile" | "competitors" | "topics" | "prompts";
export type OnboardingStepStatus = "pending" | "running" | "ready" | "error";

export interface OnboardingSessionRow {
  id: number;
  userId: number;
  url: string;
  language: "tr" | "en";
  country: string;
  crawlStatus: OnboardingStepStatus;
  crawlResult: any | null;
  crawlError: string | null;
  profileStatus: OnboardingStepStatus;
  profileResult: any | null;
  profileError: string | null;
  competitorsStatus: OnboardingStepStatus;
  competitorsResult: any | null;
  competitorsError: string | null;
  topicsStatus: OnboardingStepStatus;
  topicsResult: any | null;
  topicsError: string | null;
  promptsStatus: OnboardingStepStatus;
  promptsResult: any | null;
  promptsError: string | null;
  /** Kart: Değişiklikte yeniden üretim — hash of the (description, industry) pair the
   * current topicsResult/promptsResult were generated from, and the exact productTags
   * list used, so a client about to enter the topics step can ask "did anything that
   * matters change" without re-running generation. Null until topics have been
   * generated at least once. */
  topicsInputHash: string | null;
  topicsInputProducts: string[];
  createdAt: string;
  updatedAt: string;
}

function parseJsonOrNull(v: string | null): any | null {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function rowToOnboardingSession(row: any): OnboardingSessionRow {
  return {
    id: row.id,
    userId: row.user_id,
    url: row.url,
    language: row.language,
    country: row.country,
    crawlStatus: row.crawl_status,
    crawlResult: parseJsonOrNull(row.crawl_result_json),
    crawlError: row.crawl_error,
    profileStatus: row.profile_status,
    profileResult: parseJsonOrNull(row.profile_result_json),
    profileError: row.profile_error,
    competitorsStatus: row.competitors_status,
    competitorsResult: parseJsonOrNull(row.competitors_result_json),
    competitorsError: row.competitors_error,
    topicsStatus: row.topics_status,
    topicsResult: parseJsonOrNull(row.topics_result_json),
    topicsError: row.topics_error,
    promptsStatus: row.prompts_status,
    promptsResult: parseJsonOrNull(row.prompts_result_json),
    promptsError: row.prompts_error,
    topicsInputHash: row.topics_input_hash ?? null,
    topicsInputProducts: (() => {
      try {
        const parsed = JSON.parse(row.topics_input_products_json ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((p: any) => typeof p === "string") : [];
      } catch {
        return [];
      }
    })(),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function createOnboardingSession(userId: number, url: string, language: "tr" | "en", country: string): Promise<number> {
  await ensureSchema();
  const row = await one<{ id: number }>(
    `INSERT INTO onboarding_sessions (user_id, url, language, country) VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, url, language, country]
  );
  return row!.id;
}

export async function getOnboardingSession(userId: number, id: number): Promise<OnboardingSessionRow | null> {
  await ensureSchema();
  const row = await one(`SELECT * FROM onboarding_sessions WHERE id = $1 AND user_id = $2`, [id, userId]);
  return row ? rowToOnboardingSession(row) : null;
}

/** Column names are from the fixed OnboardingStepName union (never request input), so building
 * the SQL with them interpolated is safe — values themselves still go through $-params. */
export async function updateOnboardingStep(
  id: number,
  step: OnboardingStepName,
  patch: { status: OnboardingStepStatus; result?: unknown; error?: string | null }
): Promise<void> {
  await ensureSchema();
  const resultCol = `${step}_result_json`;
  const statusCol = `${step}_status`;
  const errorCol = `${step}_error`;
  await exec(
    `UPDATE onboarding_sessions SET ${statusCol} = $1, ${resultCol} = $2, ${errorCol} = $3, updated_at = now() WHERE id = $4`,
    [patch.status, patch.result !== undefined ? JSON.stringify(patch.result) : null, patch.error ?? null, id]
  );
}

/** Kart: Değişiklikte yeniden üretim — stamps the (description, industry) hash and the
 * exact productTags list that topics_result_json/prompts_result_json were just generated
 * from. Called right after a successful topics+prompts generation, both the very first
 * time (lib/onboarding-engine.ts's runOnboardingChain) and on every later regenerate call
 * (app/api/onboarding/sessions/[id]/regenerate/route.ts) — always together with
 * updateOnboardingStep("topics", ...) so the snapshot and the result it describes never
 * drift apart. */
export async function setOnboardingTopicsInputSnapshot(id: number, hash: string, products: string[]): Promise<void> {
  await ensureSchema();
  await exec(
    `UPDATE onboarding_sessions SET topics_input_hash = $1, topics_input_products_json = $2, updated_at = now() WHERE id = $3`,
    [hash, JSON.stringify(products), id]
  );
}

/** Marks every step that hasn't already settled (ready/error) as 'error' with the same
 * message — used when an earlier required step (e.g. crawl) fails and nothing downstream can
 * meaningfully run, so the session doesn't sit stuck on 'pending'/'running' forever. */
export async function failRemainingOnboardingSteps(id: number, fromStep: OnboardingStepName, message: string): Promise<void> {
  await ensureSchema();
  const order: OnboardingStepName[] = ["crawl", "profile", "competitors", "topics", "prompts"];
  const idx = order.indexOf(fromStep);
  for (const step of order.slice(idx)) {
    const col = `${step}_status`;
    await exec(
      `UPDATE onboarding_sessions SET ${col} = 'error', ${step}_error = $1, updated_at = now() WHERE id = $2 AND ${col} != 'ready' AND ${col} != 'error'`,
      [message, id]
    );
  }
}

// ---------------- onboarding_domain_cache (Kart: Domain bazlı önbellek) ----------------

const DOMAIN_CACHE_TTL_DAYS = 7;

export interface OnboardingDomainCacheRow {
  domain: string;
  crawlResult: any;
  profileResult: any;
  competitorsResult: any;
  topicsResult: any;
  promptsResult: any;
  topicsInputHash: string;
  topicsInputProducts: string[];
  updatedAt: string;
}

/** Null when there's no cached row for this domain, or when the row is older than the 7-day
 * TTL — an expired row is left in place (not deleted here); the next real, non-cached chain
 * run for that domain overwrites it via setOnboardingDomainCache's upsert. */
export async function getOnboardingDomainCache(domain: string): Promise<OnboardingDomainCacheRow | null> {
  await ensureSchema();
  const row = await one<any>(
    `SELECT * FROM onboarding_domain_cache WHERE domain = $1 AND updated_at > now() - interval '${DOMAIN_CACHE_TTL_DAYS} days'`,
    [domain]
  );
  if (!row) return null;
  return {
    domain: row.domain,
    crawlResult: parseJsonOrNull(row.crawl_result_json),
    profileResult: parseJsonOrNull(row.profile_result_json),
    competitorsResult: parseJsonOrNull(row.competitors_result_json),
    topicsResult: parseJsonOrNull(row.topics_result_json),
    promptsResult: parseJsonOrNull(row.prompts_result_json),
    topicsInputHash: row.topics_input_hash,
    topicsInputProducts: (() => {
      try {
        const parsed = JSON.parse(row.topics_input_products_json ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((p: any) => typeof p === "string") : [];
      } catch {
        return [];
      }
    })(),
    updatedAt: toIso(row.updated_at),
  };
}

/** Upserts the full chain's output for a domain. Called once by runOnboardingChain, only after
 * a real (non-cached) run finishes with every step — crawl, profile, competitors, topics,
 * prompts — successfully; a run where e.g. rakip önerisi failed is deliberately never cached,
 * so a later cache hit can never silently replay a partial/failed result as if it were a full
 * one. Demo-mode output is cached too, same as every other part of the app — it stays clearly
 * [DEMO DATA]-labeled inside the stored JSON itself, so replaying it from cache is no less
 * honest than generating the same placeholder again from scratch. */
export async function setOnboardingDomainCache(
  domain: string,
  data: {
    crawlResult: unknown;
    profileResult: unknown;
    competitorsResult: unknown;
    topicsResult: unknown;
    promptsResult: unknown;
    topicsInputHash: string;
    topicsInputProducts: string[];
  }
): Promise<void> {
  await ensureSchema();
  await exec(
    `INSERT INTO onboarding_domain_cache
       (domain, crawl_result_json, profile_result_json, competitors_result_json, topics_result_json, prompts_result_json, topics_input_hash, topics_input_products_json, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (domain) DO UPDATE SET
       crawl_result_json = EXCLUDED.crawl_result_json,
       profile_result_json = EXCLUDED.profile_result_json,
       competitors_result_json = EXCLUDED.competitors_result_json,
       topics_result_json = EXCLUDED.topics_result_json,
       prompts_result_json = EXCLUDED.prompts_result_json,
       topics_input_hash = EXCLUDED.topics_input_hash,
       topics_input_products_json = EXCLUDED.topics_input_products_json,
       updated_at = now()`,
    [
      domain,
      JSON.stringify(data.crawlResult),
      JSON.stringify(data.profileResult),
      JSON.stringify(data.competitorsResult),
      JSON.stringify(data.topicsResult),
      JSON.stringify(data.promptsResult),
      data.topicsInputHash,
      JSON.stringify(data.topicsInputProducts),
    ]
  );
}


// ---------------- sıralama takibi ----------------

export interface RankKeyword {
  id: number;
  userId: number;
  domain: string;
  keyword: string;
  gl: string;
  lastPosition: number | null;
  lastUrl: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  /** Verinin geldiği yer: serpapi | serpbear */
  source: string;
}

function rowToRank(r: any): RankKeyword {
  return {
    id: r.id,
    userId: r.user_id,
    domain: r.domain,
    keyword: r.keyword,
    gl: r.gl,
    lastPosition: r.last_position ?? null,
    lastUrl: r.last_url ?? null,
    lastCheckedAt: r.last_checked_at ? toIso(r.last_checked_at) : null,
    createdAt: toIso(r.created_at),
    source: r.source ?? "serpapi",
  };
}

export async function addRankKeywords(userId: number, domain: string, keywords: string[], gl = "tr"): Promise<number> {
  await ensureSchema();
  let n = 0;
  for (const k of keywords) {
    const row = await one<any>(
      `INSERT INTO rank_keywords (user_id, domain, keyword, gl) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
      [userId, domain, k, gl]
    );
    if (row) n++;
  }
  return n;
}

export async function listRankKeywords(userId: number): Promise<RankKeyword[]> {
  await ensureSchema();
  return (await many<any>(`SELECT * FROM rank_keywords WHERE user_id = $1 ORDER BY domain, keyword`, [userId])).map(rowToRank);
}

export async function listAllRankKeywords(): Promise<RankKeyword[]> {
  await ensureSchema();
  return (await many<any>(`SELECT * FROM rank_keywords ORDER BY user_id`)).map(rowToRank);
}

export async function deleteRankKeyword(userId: number, id: number): Promise<void> {
  await ensureSchema();
  await exec(`DELETE FROM rank_keywords WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function saveRankCheck(id: number, position: number | null, url: string | null): Promise<void> {
  await ensureSchema();
  await exec(`INSERT INTO rank_history (keyword_id, position, url) VALUES ($1, $2, $3)`, [id, position, url]);
  await exec(`UPDATE rank_keywords SET last_position = $1, last_url = $2, last_checked_at = now() WHERE id = $3`, [position, url, id]);
}

/** Son 60 günün sıralama geçmişi (anahtar kelime başına). */
export async function rankHistory(userId: number): Promise<Record<number, { position: number | null; at: string }[]>> {
  await ensureSchema();
  const rows = await many<any>(
    `SELECT h.keyword_id, h.position, h.checked_at FROM rank_history h JOIN rank_keywords k ON k.id = h.keyword_id
      WHERE k.user_id = $1 AND h.checked_at >= now() - interval '60 days' ORDER BY h.checked_at`,
    [userId]
  );
  const out: Record<number, { position: number | null; at: string }[]> = {};
  for (const r of rows) (out[r.keyword_id] ??= []).push({ position: r.position, at: toIso(r.checked_at) });
  return out;
}


/** Sıralama geçmişine dış kaynaktan (SerpBear) belirli bir tarihli kayıt ekler; aynı gün varsa atlar. */
export async function importRankPoint(id: number, position: number | null, url: string | null, at: Date): Promise<boolean> {
  await ensureSchema();
  const exists = await one<any>(`SELECT 1 FROM rank_history WHERE keyword_id = $1 AND checked_at::date = $2::date`, [id, at.toISOString()]);
  if (exists) return false;
  await exec(`INSERT INTO rank_history (keyword_id, position, url, checked_at) VALUES ($1, $2, $3, $4)`, [id, position, url, at.toISOString()]);
  return true;
}

export async function setRankLatest(id: number, position: number | null, url: string | null, at: Date, source: string): Promise<void> {
  await ensureSchema();
  await exec(`UPDATE rank_keywords SET last_position = $1, last_url = $2, last_checked_at = $3, source = $4 WHERE id = $5`, [position, url, at.toISOString(), source, id]);
}

export async function rankKeywordId(userId: number, domain: string, keyword: string, gl: string): Promise<number> {
  await ensureSchema();
  const row =
    (await one<any>(`INSERT INTO rank_keywords (user_id, domain, keyword, gl) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`, [userId, domain, keyword, gl])) ??
    (await one<any>(`SELECT id FROM rank_keywords WHERE user_id = $1 AND domain = $2 AND keyword = $3 AND gl = $4`, [userId, domain, keyword, gl]));
  return row.id;
}

// ---------------- kullanıcı entegrasyonları (SerpApi, SerpBear, ogimg, Google Ads) ----------------

export interface IntegrationRow {
  provider: string;
  config: Record<string, string>;
  /** Gizli alanların yalnızca maskeli hâli — istemciye bu gider. */
  secretsMasked: Record<string, string>;
  updatedAt: string;
}

const parseObj = (s: string): Record<string, string> => {
  try {
    const o = JSON.parse(s);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
};

export async function listIntegrations(userId: number): Promise<IntegrationRow[]> {
  await ensureSchema();
  const rows = await many<any>(`SELECT * FROM user_integrations WHERE user_id = $1`, [userId]);
  return rows.map((r) => {
    const sec = parseObj(r.secrets_json);
    return {
      provider: r.provider,
      config: parseObj(r.config_json),
      secretsMasked: Object.fromEntries(Object.entries(sec).filter(([, v]) => v).map(([k, v]) => [k, maskSecret(String(v))])),
      updatedAt: toIso(r.updated_at),
    };
  });
}

/** Sunucu tarafı — ham gizli değerleri içerir. İstemciye ASLA gönderme. */
export async function getIntegration(userId: number, provider: string): Promise<{ config: Record<string, string>; secrets: Record<string, string> } | null> {
  await ensureSchema();
  const r = await one<any>(`SELECT * FROM user_integrations WHERE user_id = $1 AND provider = $2`, [userId, provider]);
  return r ? { config: parseObj(r.config_json), secrets: parseObj(r.secrets_json) } : null;
}

/** Boş bırakılan gizli alanlar mevcut değeri korur. */
export async function saveIntegration(userId: number, provider: string, config: Record<string, string>, secrets: Record<string, string>): Promise<void> {
  await ensureSchema();
  const cur = await getIntegration(userId, provider);
  const merged = { ...(cur?.secrets ?? {}) };
  for (const [k, v] of Object.entries(secrets)) if (v) merged[k] = v;
  await exec(
    `INSERT INTO user_integrations (user_id, provider, config_json, secrets_json, updated_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, provider) DO UPDATE SET config_json = EXCLUDED.config_json, secrets_json = EXCLUDED.secrets_json, updated_at = now()`,
    [userId, provider, JSON.stringify(config), JSON.stringify(merged)]
  );
}

export async function deleteIntegration(userId: number, provider: string): Promise<void> {
  await ensureSchema();
  await exec(`DELETE FROM user_integrations WHERE user_id = $1 AND provider = $2`, [userId, provider]);
}

export async function usersWithIntegration(provider: string): Promise<number[]> {
  await ensureSchema();
  return (await many<any>(`SELECT user_id FROM user_integrations WHERE provider = $1`, [provider])).map((r) => r.user_id);
}


/** Backlink sonuçları önbelleği (Ahrefs API birimi ve Bing kotası harcamamak için). */
export async function getBacklinkCache<T>(userId: number, key: string, maxAgeHours = 24): Promise<{ data: T; createdAt: string } | null> {
  await ensureSchema();
  const r = await one<any>(`SELECT data_json, created_at FROM backlink_cache WHERE user_id = $1 AND cache_key = $2 AND created_at > now() - ($3 || ' hours')::interval`, [userId, key, String(maxAgeHours)]);
  if (!r) return null;
  try {
    return { data: JSON.parse(r.data_json) as T, createdAt: toIso(r.created_at) };
  } catch {
    return null;
  }
}

export async function setBacklinkCache(userId: number, key: string, data: unknown): Promise<void> {
  await ensureSchema();
  await exec(
    `INSERT INTO backlink_cache (user_id, cache_key, data_json, created_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, cache_key) DO UPDATE SET data_json = EXCLUDED.data_json, created_at = now()`,
    [userId, key, JSON.stringify(data)]
  );
}


// ---------------- Kayıt listesi (citation) ----------------

export interface CitationProfile {
  bizType?: string;
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  category?: string;
  description?: string;
  texts?: Record<string, unknown> | null;
}

export async function getCitationProfile(userId: number, site: string): Promise<CitationProfile> {
  await ensureSchema();
  const r = await one<any>(`SELECT data_json FROM citation_profiles WHERE user_id = $1 AND site = $2`, [userId, site]);
  try {
    return r ? JSON.parse(r.data_json) : {};
  } catch {
    return {};
  }
}

export async function saveCitationProfile(userId: number, site: string, data: CitationProfile): Promise<void> {
  await ensureSchema();
  await exec(
    `INSERT INTO citation_profiles (user_id, site, data_json, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, site) DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = now()`,
    [userId, site, JSON.stringify(data)]
  );
}

export interface CitationStatusRow {
  dirId: string;
  status: string;
  listingUrl: string | null;
  linkFound: boolean | null;
  checkedAt: string | null;
}

export async function listCitationStatus(userId: number, site: string): Promise<CitationStatusRow[]> {
  await ensureSchema();
  const rows = await many<any>(`SELECT * FROM citation_status WHERE user_id = $1 AND site = $2`, [userId, site]);
  return rows.map((r) => ({ dirId: r.dir_id, status: r.status, listingUrl: r.listing_url ?? null, linkFound: r.link_found ?? null, checkedAt: r.checked_at ? toIso(r.checked_at) : null }));
}

export async function setCitationStatus(userId: number, site: string, dirId: string, patch: { status?: string; listingUrl?: string | null; linkFound?: boolean | null; checked?: boolean }): Promise<void> {
  await ensureSchema();
  await exec(
    `INSERT INTO citation_status (user_id, site, dir_id, status, listing_url, link_found, checked_at, updated_at)
     VALUES ($1, $2, $3, COALESCE($4, 'todo'), $5, $6, CASE WHEN $7 THEN now() ELSE NULL END, now())
     ON CONFLICT (user_id, site, dir_id) DO UPDATE SET
       status = COALESCE($4, citation_status.status),
       listing_url = CASE WHEN $8 THEN $5 ELSE citation_status.listing_url END,
       link_found = CASE WHEN $9 THEN $6 ELSE citation_status.link_found END,
       checked_at = CASE WHEN $7 THEN now() ELSE citation_status.checked_at END,
       updated_at = now()`,
    [userId, site, dirId, patch.status ?? null, patch.listingUrl ?? null, patch.linkFound ?? null, !!patch.checked, patch.listingUrl !== undefined, patch.linkFound !== undefined]
  );
}
