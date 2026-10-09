"use client";

import { useEffect, useRef, type ReactNode, type ElementType } from "react";

/**
 * Kaydırınca beliren blok — arvow.com / peec.ai'daki "sayfa akıyor" hissinin temeli.
 * Görünür alana girince bir kez `.is-visible` eklenir (bkz. app/globals.css `.reveal`).
 * JS yoksa / reduced-motion açıksa içerik zaten görünür kalır.
 */
export default function Reveal({
  children,
  delay = 0,
  variant = "up",
  className = "",
  as: Tag = "div",
  spotlight = false,
}: {
  children: ReactNode;
  delay?: number;
  variant?: "up" | "scale" | "left" | "right" | "tilt";
  className?: string;
  as?: ElementType;
  /** Fareyi takip eden mor ışık vurgusu (kartlar için). */
  spotlight?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onMove = spotlight
    ? (e: React.MouseEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
    : undefined;

  return (
    <Tag
      ref={ref}
      data-variant={variant}
      onMouseMove={onMove}
      className={`reveal ${spotlight ? "spotlight" : ""} ${className}`}
      style={{ ["--reveal-delay" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
