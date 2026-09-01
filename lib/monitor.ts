import { runSeoAudit } from "./seo-audit";
import {
  createAlert,
  getLatestMonitorCheck,
  saveMonitorCheck,
  type MonitoredPage,
} from "./db";

/**
 * Continuous AXO monitoring. robots.txt / CDN bot-blocking can change silently (a WAF
 * update, a CDN default flip) — a one-time audit snapshot won't catch that. This
 * re-runs the audit for a tracked page, diffs the blocked-bot list against the last
 * recorded check, and raises an alert the moment a bot that used to be allowed
 * becomes blocked. Nothing here needs a persistent server process: it's designed to
 * be triggered by an external scheduler (see scripts/check-monitors.mjs) hitting
 * /api/monitor/check, since that's the only kind of "cron" that survives outside a
 * long-running dev server.
 */

export interface CheckResult {
  pageId: number;
  url: string;
  score: number;
  aiCrawlScore: number;
  blockedBots: string[];
  newlyBlocked: string[];
  newlyUnblocked: string[];
  alertRaised: boolean;
}

export async function checkMonitoredPage(page: MonitoredPage): Promise<CheckResult> {
  const audit = await runSeoAudit(page.url);
  const blockedBots = audit.meta.aiBotAccess.filter((b) => !b.allowed).map((b) => b.bot);

  const previous = await getLatestMonitorCheck(page.id);
  const previousBlocked = new Set(previous?.blockedBots ?? []);
  const currentBlocked = new Set(blockedBots);

  const newlyBlocked = blockedBots.filter((b) => !previousBlocked.has(b));
  const newlyUnblocked = (previous?.blockedBots ?? []).filter((b) => !currentBlocked.has(b));

  await saveMonitorCheck(page.id, audit.score, audit.aiCrawlScore, blockedBots);

  let alertRaised = false;
  if (previous && newlyBlocked.length > 0) {
    const message = `⚠️ ${page.label ?? page.url}: ${newlyBlocked.join(", ")} newly blocked in robots.txt (was allowed as of the last check). If this wasn't deliberate, this page just went dark to those AI engines.`;
    await createAlert(page.id, message);
    alertRaised = true;
    await sendSlackAlert(page.slackWebhook, message);
  }

  return {
    pageId: page.id,
    url: page.url,
    score: audit.score,
    aiCrawlScore: audit.aiCrawlScore,
    blockedBots,
    newlyBlocked,
    newlyUnblocked,
    alertRaised,
  };
}

async function sendSlackAlert(pageWebhook: string | null, message: string) {
  const webhookUrl = pageWebhook || process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `Epicsem AXO alert — ${message}` }),
    });
  } catch (err) {
    console.error("Slack alert delivery failed:", err);
  }
}
