"use client";

/**
 * Epicsem ortak UI şablonları (Arvow tarzı açık tema). Tüm araç sayfaları kart, tablo,
 * sekme ve çekmece için bunları kullanır; renkler tailwind.config.ts'teki değişkenlerden:
 * ink (metin), panel (kart), muted (ikincil zemin), border (çizgi), accent (#5d16ff),
 * seo (yeşil), warn (turuncu), danger (kırmızı).
 */
import { useEffect, useState, type ReactNode } from "react";

// ---------------- Card ----------------
export function Card({ children, className = "", padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={`rounded-xl border border-border bg-panel shadow-sm ${padded ? "p-6" : ""} ${className}`}>{children}</div>;
}

/** Kart başlığı: başlık + açıklama solda, eylem sağda. */
export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-ink">{title}</div>
        {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

/** KPI kartı: etiket, büyük değer, alt not. */
export function StatCard({ label, value, hint, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="!p-5">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        {label}
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </Card>
  );
}

// ---------------- Table ----------------
export interface Column<T> {
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}

/**
 * Sade, ince çizgili tablo. İki kullanım:
 *  - Basit: <StandardTable headers={[...]} data={[[...], ...]} />
 *  - Kolon tanımlı: <StandardTable columns={[...]} rows={items} onRowClick={...} />
 */
export function StandardTable<T>(
  props:
    | { headers: ReactNode[]; data: ReactNode[][]; empty?: ReactNode; onRowClick?: (i: number) => void }
    | { columns: Column<T>[]; rows: T[]; rowKey?: (row: T, i: number) => string | number; empty?: ReactNode; onRowClick?: (row: T, i: number) => void }
) {
  const al = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  const isSimple = "headers" in props;
  const heads = isSimple ? props.headers.map((h) => ({ header: h, align: undefined as string | undefined, className: "" })) : props.columns;
  const count = isSimple ? props.data.length : props.rows.length;
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-panel">
      <table className="w-full text-left text-sm text-ink">
        <thead className="border-b border-border bg-muted text-xs font-semibold uppercase text-slate-500">
          <tr>
            {heads.map((h, i) => (
              <th key={i} className={`px-6 py-3 ${al(h.align)} ${h.className ?? ""}`}>
                {h.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {count === 0 ? (
            <tr>
              <td colSpan={heads.length} className="px-6 py-10 text-center text-sm text-slate-500">
                {props.empty ?? "Kayıt yok."}
              </td>
            </tr>
          ) : isSimple ? (
            props.data.map((row, r) => (
              <tr key={r} onClick={props.onRowClick ? () => props.onRowClick!(r) : undefined} className={`transition-colors hover:bg-muted/50 ${props.onRowClick ? "cursor-pointer" : ""}`}>
                {row.map((cell, c) => (
                  <td key={c} className="px-6 py-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            props.rows.map((row, r) => (
              <tr
                key={props.rowKey ? props.rowKey(row, r) : r}
                onClick={props.onRowClick ? () => props.onRowClick!(row, r) : undefined}
                className={`transition-colors hover:bg-muted/50 ${props.onRowClick ? "cursor-pointer" : ""}`}
              >
                {props.columns.map((col, c) => (
                  <td key={c} className={`px-6 py-4 ${al(col.align)} ${col.className ?? ""}`}>
                    {col.cell(row, r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Tabs ----------------
export interface TabItem {
  label: ReactNode;
  content?: ReactNode;
  count?: number | null;
  key?: string;
}

/**
 * Alt çizgili sekmeler. İçerik verilirse kendi içinde gösterir (kontrolsüz kullanım);
 * value/onChange verilirse sadece sekme şeridi olarak kontrollü çalışır.
 */
export function UnderlineTabs({ tabs, value, onChange, className = "" }: { tabs: TabItem[]; value?: number; onChange?: (i: number) => void; className?: string }) {
  const [inner, setInner] = useState(0);
  const active = value ?? inner;
  const set = (i: number) => (onChange ? onChange(i) : setInner(i));
  const content = tabs[active]?.content;
  return (
    <div className={className}>
      <div className="flex gap-8 overflow-x-auto border-b border-border">
        {tabs.map((tab, idx) => (
          <button
            key={tab.key ?? idx}
            type="button"
            onClick={() => set(idx)}
            className={`relative flex items-center gap-1.5 whitespace-nowrap pb-3 text-sm font-medium transition-colors ${active === idx ? "text-accent" : "text-slate-500 hover:text-ink"}`}
          >
            {tab.label}
            {tab.count != null && <span className={`rounded px-1.5 text-[11px] font-semibold ${active === idx ? "bg-accent/10 text-accent" : "bg-muted text-slate-500"}`}>{tab.count}</span>}
            {active === idx && <span className="absolute bottom-0 left-0 h-[2px] w-full bg-accent" />}
          </button>
        ))}
      </div>
      {content !== undefined && <div className="py-6">{content}</div>}
    </div>
  );
}

// ---------------- Drawer ----------------
const DRAWER_W = { md: "max-w-md", lg: "max-w-xl", xl: "max-w-2xl" } as const;

/** Sağdan açılan çekmece. Esc ve arka plana tıklama kapatır; açıkken sayfa kaydırması kilitlenir. */
export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  size = "md",
  footer,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  size?: keyof typeof DRAWER_W;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/20 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div className={`flex w-screen ${DRAWER_W[size]} flex-col border-l border-border bg-panel shadow-2xl`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-ink">{title}</h3>
              {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label="Kapat" className="text-xl leading-none text-slate-400 hover:text-ink">
              &times;
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">{children}</div>
          {footer && <div className="border-t border-border px-6 py-4">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

// ---------------- Page header ----------------
/** Sayfa başlığı: başlık + açıklama solda, eylemler sağda. */
export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {back && <div className="mb-1 text-xs text-slate-500">{back}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
