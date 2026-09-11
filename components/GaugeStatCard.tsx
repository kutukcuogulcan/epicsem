import ScoreGauge from "./ScoreGauge";

type Tone = "seo" | "warn" | "danger";

const TONE_TEXT: Record<Tone, string> = {
  seo: "text-seo",
  warn: "text-warn",
  danger: "text-danger",
};

interface GaugeStatCardProps {
  label: string;
  score: number; // 0-100
  suffix?: string; // e.g. "%"
  description: string;
  tone: Tone;
}

/**
 * A StatCard variant that leads with a circular progress ring instead of plain text —
 * the headline-metric treatment real AI-visibility dashboards (e.g. Arvow's Visibility
 * tile) use for their single most important number, since a ring reads "how full" at a
 * glance in a way a bare percentage doesn't.
 */
export default function GaugeStatCard({ label, score, suffix = "%", description, tone }: GaugeStatCardProps) {
  return (
    <div className="card flex items-center gap-4">
      <ScoreGauge label="" score={score} colorClass={TONE_TEXT[tone]} />
      <div className="min-w-0">
        <div className="text-xs text-ink/40">{label}</div>
        <div className={`text-2xl font-extrabold mt-1 ${TONE_TEXT[tone]}`}>
          {score}
          {suffix}
        </div>
        <div className="text-xs text-ink/40 mt-1">{description}</div>
      </div>
    </div>
  );
}
