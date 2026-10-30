/** LLM Marka Monitörleri için küçük görsel parçalar: puan halkası, duygu çubuğu, motor rozeti. */

export const ENGINE_META: Record<string, { name: string; color: string }> = {
  openai: { name: "ChatGPT", color: "#10a37f" },
  anthropic: { name: "Claude", color: "#d97757" },
  google: { name: "Gemini", color: "#4285f4" },
  perplexity: { name: "Perplexity", color: "#20b8cd" },
  xai: { name: "Grok", color: "#0f172a" },
  deepseek: { name: "DeepSeek", color: "#4d6bfe" },
  meta: { name: "Meta AI", color: "#0866ff" },
  microsoft: { name: "Copilot", color: "#7b61ff" },
};

export const ringColor = (n: number) => (n >= 65 ? "#16a34a" : n >= 40 ? "#f59e0b" : "#ef4444");

/** 0-100 puanı halka içinde gösterir. */
export function ScoreRing({ value, size = 30, stroke = 3 }: { value: number | null; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f3" strokeWidth={stroke} />
        {value != null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColor(v)} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />}
      </svg>
      <span className="absolute font-semibold tabular-nums text-ink" style={{ fontSize: size * 0.34 }}>
        {value == null ? "—" : v}
      </span>
    </span>
  );
}

/** Duygu (0-100) → net puan (-100…+100). */
export const netSentiment = (s: number | null) => (s == null ? null : Math.round((s - 50) * 2));
export const sentimentLabel = (s: number | null) => (s == null ? "Veri yok" : s >= 60 ? "Pozitif" : s >= 40 ? "Nötr" : "Negatif");

/** Kırmızı→sarı→yeşil degrade üzerinde konum işareti. */
export function SentimentBar({ value, width = 64 }: { value: number | null; width?: number }) {
  return (
    <span className="relative inline-block" style={{ width }}>
      <span className="block h-1.5 rounded-full" style={{ background: "linear-gradient(90deg,#f87171,#fbbf24 50%,#4ade80)", opacity: value == null ? 0.3 : 1 }} />
      {value != null && <span className="absolute -bottom-1.5 h-0 w-0 -translate-x-1/2 border-x-[3px] border-b-[4px] border-x-transparent border-b-ink/70" style={{ left: `${Math.max(3, Math.min(97, value))}%` }} />}
    </span>
  );
}

export function EngineDot({ engine, size = 18 }: { engine: string; size?: number }) {
  const m = ENGINE_META[engine] ?? { name: engine, color: "#94a3b8" };
  return (
    <span title={m.name} className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ width: size, height: size, background: m.color, fontSize: size * 0.5 }}>
      {m.name.charAt(0)}
    </span>
  );
}
