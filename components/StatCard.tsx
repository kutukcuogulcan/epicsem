type Tone = "accent" | "seo" | "warn" | "danger" | "ink";

const TONE_TEXT: Record<Tone, string> = {
  accent: "text-accent",
  seo: "text-seo",
  warn: "text-warn",
  danger: "text-danger",
  ink: "text-ink",
};

interface StatCardProps {
  label: string;
  value: string;
  description: string;
  tone?: Tone;
}

/**
 * Small metric tile — label, big number, one-line description underneath. Modeled on
 * the stat-card row real GEO/AI-visibility dashboards (e.g. Arvow's LLM Visibility
 * Tracker) lead with, instead of burying the headline number inside a chart or table.
 */
export default function StatCard({ label, value, description, tone = "accent" }: StatCardProps) {
  return (
    <div className="card">
      <div className="text-xs text-ink/40">{label}</div>
      <div className={`text-3xl font-semibold mt-1.5 ${TONE_TEXT[tone]}`}>{value}</div>
      <div className="text-xs text-ink/40 mt-1.5">{description}</div>
    </div>
  );
}
