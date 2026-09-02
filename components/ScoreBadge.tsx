function toneFor(score: number, kind: "percent" | "sentiment"): "seo" | "warn" | "danger" {
  const good = kind === "sentiment" ? 70 : 50;
  const mid = kind === "sentiment" ? 50 : 20;
  if (score >= good) return "seo";
  if (score >= mid) return "warn";
  return "danger";
}

const TONE_CLASS = {
  seo: "bg-seo/10 text-seo border-seo/20",
  warn: "bg-warn/10 text-warn border-warn/20",
  danger: "bg-danger/10 text-danger border-danger/20",
};

interface ScoreBadgeProps {
  /** Raw score to color by — 0-100 for both percent and sentiment kinds. */
  score: number | null;
  /** What's displayed inside the circle — defaults to `${score}` for percent, `score` as-is for sentiment. */
  display?: string;
  kind?: "percent" | "sentiment";
}

/** Small colored circle with a number inside — the "how good is this at a glance" chip real
 * visibility-tracking tables use (e.g. Arvow's per-prompt Visibility/Sentiment columns) instead
 * of plain text percentages. */
export default function ScoreBadge({ score, display, kind = "percent" }: ScoreBadgeProps) {
  if (score == null) {
    return (
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border text-ink/30 text-xs font-medium">
        —
      </span>
    );
  }
  const tone = toneFor(score, kind);
  return (
    <span
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full border text-xs font-semibold ${TONE_CLASS[tone]}`}
    >
      {display ?? score}
    </span>
  );
}
