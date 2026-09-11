/**
 * Horizontal red→yellow→green gradient track with a marker positioned at `value` (0-100) —
 * the "how good, at a glance, on a continuous scale" bar real AI-visibility dashboards
 * (e.g. Arvow's per-model sentiment bars) use instead of a flat single-color fill, since a
 * mid score should visually read as "mid", not just "a shorter version of full".
 */
export default function GradientBar({ value, className = "" }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`relative h-2 rounded-full overflow-hidden shrink-0 ${className}`}
      style={{ background: "linear-gradient(90deg, #dc2626 0%, #d97706 50%, #16a34a 100%)" }}
    >
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1 h-3.5 rounded-full bg-ink/80 shadow-sm"
        style={{ left: `${clamped}%` }}
      />
    </div>
  );
}
