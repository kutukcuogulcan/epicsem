export default function ScoreGauge({ label, score, colorClass }: { label: string; score: number; colorClass: string }) {
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="42" stroke="currentColor" className="text-border" strokeWidth="8" fill="none" />
          <circle
            cx="50"
            cy="50"
            r="42"
            stroke="currentColor"
            className={colorClass}
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-2xl font-semibold">{score}</div>
      </div>
      <div className="text-sm text-ink/60">{label}</div>
    </div>
  );
}
