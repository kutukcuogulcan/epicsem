"use client";

/**
 * Epicsem ortak UI şablonları (Arvow tarzı açık tema). Tüm araç sayfaları kart, tablo,
 * sekme ve çekmece için bunları kullanır; renkler tailwind.config.ts'teki değişkenlerden:
 * ink (metin), panel (kart), muted (ikincil zemin), border (çizgi), accent (#4f00ff),
 * seo (yeşil), warn (turuncu), danger (kırmızı).
 */
import { useEffect, useState, type ReactNode } from "react";

// ---------------- Card ----------------
export function Card({ children, className = "", padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={`rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)] ${padded ? "p-6" : ""} ${className}`}>{children}</div>;
}

/** Kart başlığı: başlık + açıklama solda, eylem sağda. */
export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-ink">{title}</div>
        {subtitle && <div className="mt-0.5 text-xs text-sub">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

/** KPI kartı: etiket, büyük değer, alt not. */
export function StatCard({ label, value, hint, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="!p-5">
      <div className="flex items-center justify-between text-xs font-medium text-sub">
        {label}
        {icon}
      </div>
      <div className="mt-2 text-2xl font-medium tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-sub">{hint}</div>}
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
        <thead className="border-b border-border bg-[#fafafa] text-xs font-medium text-sub">
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
              <td colSpan={heads.length} className="px-6 py-10 text-center text-sm text-sub">
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
            className={`relative flex items-center gap-1.5 whitespace-nowrap pb-3 text-sm font-medium transition-colors ${active === idx ? "text-accent" : "text-sub hover:text-ink"}`}
          >
            {tab.label}
            {tab.count != null && <span className={`rounded px-1.5 text-[11px] font-medium ${active === idx ? "bg-accent/10 text-accent" : "bg-muted text-sub"}`}>{tab.count}</span>}
            {active === idx && <span className="absolute bottom-0 left-0 h-[2px] w-full bg-accent" />}
          </button>
        ))}
      </div>
      {content !== undefined && <div className="py-6">{content}</div>}
    </div>
  );
}

// ---------------- Drawer ----------------
const DRAWER_W = { md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", "2xl": "max-w-2xl" } as const;

/**
 * Sağdan açılan çekmece. Esc ve arka plana tıklama kapatır; açıkken sayfa kaydırması kilitlenir.
 * as="form" + onSubmit ile panelin kendisi form olur (footer'daki submit düğmesi çalışır).
 */
export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  eyebrow,
  icon,
  size = "md",
  footer,
  as = "div",
  onSubmit,
  bodyClassName = "p-6",
  header,
  panelClassName,
  raw = false,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Başlık alanının içeriğini tamamen özelleştir (kapat düğmesi yine eklenir). */
  header?: ReactNode;
  /** Panel sınıflarını değiştir (varsayılan: flex sütun, sabit genişlik). */
  panelClassName?: string;
  /** true: children gövde sarmalayıcısı olmadan doğrudan panele konur (kendi gövde/footer düzeni olan çekmeceler için). */
  raw?: boolean;
  subtitle?: ReactNode;
  /** Başlığın üstündeki küçük etiket (ör. "Entegrasyon"). */
  eyebrow?: ReactNode;
  icon?: ReactNode;
  size?: keyof typeof DRAWER_W;
  footer?: ReactNode;
  as?: "div" | "form";
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  bodyClassName?: string;
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
  const panelCls = panelClassName ?? `flex h-full w-screen ${DRAWER_W[size]} flex-col border-l border-border bg-panel shadow-2xl animate-[pop-in_0.25s_ease-out]`;
  const inner = (
    <>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-panel px-6 py-4">
        {header ?? (
          <div className="flex min-w-0 items-center gap-3">
            {icon}
            <div className="min-w-0">
              {eyebrow && <div className="text-[11px] font-medium uppercase tracking-wide text-sub">{eyebrow}</div>}
              <h3 className="text-lg font-medium text-ink">{title}</h3>
              {subtitle && <div className="mt-0.5 text-xs text-sub">{subtitle}</div>}
            </div>
          </div>
        )}
        <button type="button" onClick={onClose} aria-label="Kapat" className="text-xl leading-none text-slate-400 hover:text-ink">
          &times;
        </button>
      </div>
      {raw ? (
        children
      ) : (
        <>
          <div className={`flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
          {footer && <div className="border-t border-border px-6 py-4">{footer}</div>}
        </>
      )}
    </>
  );
  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/20 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        {as === "form" ? (
          <form className={panelCls} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
            {inner}
          </form>
        ) : (
          <div className={panelCls} onClick={(e) => e.stopPropagation()}>
            {inner}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Page header ----------------
/** Sayfa başlığı (ToolPageHeader ile aynı görünüm) + isteğe bağlı geri bağlantısı. */
export function PageHeader({ title, description, actions, back, badge }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode; badge?: string }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 border-b border-border pb-6 md:flex-row md:items-center">
      <div className="min-w-0">
        {back && <div className="mb-1 text-xs text-sub">{back}</div>}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-medium text-ink">{title}</h1>
          {badge && <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">{badge}</span>}
        </div>
        {description && <div className="mt-1 max-w-3xl text-sm text-sub">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------- Ekran durumları: yükleniyor / boş / hata ----------------
/** Gri, nabız gibi atan yer tutucu blok. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-[#f0f1f2] ${className}`} />;
}

/** Tablo yüklenirken: başlık şeridi + iskelet satırlar. `bare` ile çerçevesiz (tbody içinde kullanmak için değil). */
export function TableSkeleton({ rows = 5, cols = 4, bare = false }: { rows?: number; cols?: number; bare?: boolean }) {
  const body = (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Yükleniyor">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 px-4 py-3.5">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={`h-3.5 ${c === 0 ? "flex-[2]" : "flex-1"}`} />
          ))}
        </div>
      ))}
    </div>
  );
  if (bare) return body;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
      <div className="h-10 border-b border-border bg-[#fafafa]" />
      {body}
    </div>
  );
}

/** Sayfa yüklenirken: başlık + KPI kartları + tablo iskeleti. */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Yükleniyor">
      <div className="space-y-2 border-b border-border pb-6">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className={`grid gap-3 ${cards === 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-border bg-panel p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
      <TableSkeleton />
    </div>
  );
}

/** Boş durum: ne olmadığını ve ne yapılacağını söyler; 0'ları gerçek sonuç sanmamak için. */
export function EmptyBlock({ title, description, action, icon, compact = false }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "px-4 py-8" : "px-6 py-14"}`}>
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] border border-border bg-panel text-sub shadow-[0_1px_2px_rgba(13,18,28,0.05)]">
        {icon ?? (
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7l7-4 7 4-7 4-7-4z" />
            <path d="M3 7v6l7 4 7-4V7" />
          </svg>
        )}
      </span>
      <div className="text-sm font-medium text-ink">{title}</div>
      {description && <div className="mt-1 max-w-md text-sm text-sub">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Hata durumu: anlaşılır mesaj + isteğe bağlı "Tekrar dene". */
export function ErrorBlock({ message, onRetry, className = "" }: { message: ReactNode; onRetry?: () => void; className?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className={`flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm ${className}`}>
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger text-[10px] font-medium text-white">!</span>
      <div className="min-w-0 flex-1 text-danger">{message}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 text-sm font-medium text-danger underline hover:no-underline">
          Tekrar dene
        </button>
      )}
    </div>
  );
}
