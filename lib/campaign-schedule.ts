/** Autoblog zamanlaması (saf; test: scripts/check-campaign-schedule.mjs). */

type Sched = { frequency: "daily" | "weekly" | "monthly"; status?: string; nextRunAt: string | null; lastRunAt?: string | null; options: { randomMinutes?: number } };

const FREQUENCY_DAYS: Record<Sched["frequency"], number> = { daily: 1, weekly: 7, monthly: 30 };

export function frequencyDays(f: Sched["frequency"]): number {
  return FREQUENCY_DAYS[f] ?? 7;
}

export function isCampaignDue(campaign: Sched): boolean {
  if (campaign.status !== "active") return false;
  if (campaign.nextRunAt) return Date.now() >= new Date(campaign.nextRunAt).getTime() - 30 * 60 * 1000;
  if (!campaign.lastRunAt) return true;
  // 6 saatlik cron penceresi yüzünden "günlük" bir kampanya 24 saati birkaç dakika
  // kaçırıp bir gün atlamasın diye küçük bir tolerans bırakıyoruz.
  const dueAt = new Date(campaign.lastRunAt).getTime() + frequencyDays(campaign.frequency) * 864e5 - 30 * 60 * 1000;
  return Date.now() >= dueAt;
}

/** Bir sonraki çalışma zamanı: sıklık + (varsa) rastgele gecikme. */
export function computeNextRun(campaign: Sched, from = Date.now()): Date {
  const rand = Math.max(0, campaign.options.randomMinutes ?? 0);
  const period = frequencyDays(campaign.frequency) * 864e5;
  // Planlanan saatten say, çalıştığı saatten değil: cron 10-60 dk geç başlayınca "günlük" kampanya her gün
  // kayıp bir turu kaçırıyordu (ayda ~24 yazı). Manuel/erken çalışmada ya da çok gecikmede şimdiden say.
  const planned = campaign.nextRunAt ? new Date(campaign.nextRunAt).getTime() : NaN;
  const base = planned <= from && planned > from - period ? planned : from;
  return new Date(base + period + Math.floor(Math.random() * rand) * 60_000);
}

