/** Veri yokken gösterilen soluk "hayalet" grafik + çağrı — boş sayfa yerine panonun nasıl
 * görüneceğini hissettirir (gerçek veri gibi sunulmaz, üstü örtülü ve açıkça boş). */
export default function GhostChart({ title, body, cta }: { title: string; body: string; cta?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-panel">
      <svg viewBox="0 0 600 180" className="h-48 w-full opacity-40" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="ghost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5d16ff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#5d16ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="0" x2="600" y1={30 + i * 40} y2={30 + i * 40} stroke="#e2e8f0" strokeDasharray="4 4" />
        ))}
        <path d="M0,150 C80,140 120,120 180,125 C240,130 280,90 340,85 C400,80 440,60 500,50 C540,44 570,40 600,35 L600,180 L0,180 Z" fill="url(#ghost)" />
        <path d="M0,150 C80,140 120,120 180,125 C240,130 280,90 340,85 C400,80 440,60 500,50 C540,44 570,40 600,35" fill="none" stroke="#5d16ff" strokeWidth="2.5" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-panel/60 text-center backdrop-blur-[1px] px-6">
        <div className="font-bold">{title}</div>
        <p className="max-w-md text-sm text-ink/55">{body}</p>
        {cta}
      </div>
    </div>
  );
}
