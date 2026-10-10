"use client";

import { useEffect, useRef, useState } from "react";

/** Görünür olunca sayan rakam bandı. Rakamlar ürünün kendi gerçek kapsamı (motor sayısı,
 * araç sayısı vb.) — müşteri sayısı gibi uydurma bir "sosyal kanıt" değil. */
export default function StatsBand({ items }: { items: { value: number; suffix?: string; label: string }[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [t, setT] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / 1400);
        setT(1 - Math.pow(1 - p, 3));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((s) => (
        <div key={s.label} className="rounded-3xl border border-border bg-panel p-6 text-center">
          <div className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gradient tabular-nums">
            {Math.round(s.value * t)}
            {s.suffix}
          </div>
          <div className="mt-2 text-sm text-ink/55">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
