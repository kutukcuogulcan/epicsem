/**
 * Araç sayfası başlığı — Arvow tarzı: solda başlık (+ isteğe bağlı rozet) ve tek satır
 * açıklama, sağda eylem düğmesi, altında ince çizgi. Breadcrumb ve dekor yok.
 *
 * Yeni kullanım: <ToolPageHeader title description badge actionButton />
 * Eski prop adları da çalışır: body (= description), actions (= actionButton),
 * children (açıklamanın altındaki ek satır), breadcrumbLabel ve eyebrow (artık gösterilmez).
 */
export interface ToolPageHeaderProps {
  title: string;
  description?: React.ReactNode;
  badge?: string;
  actionButton?: React.ReactNode;
  /** Açıklamanın altında gösterilen ek içerik (ör. "Son güncelleme"). */
  children?: React.ReactNode;
  /** @deprecated description kullan */
  body?: React.ReactNode;
  /** @deprecated actionButton kullan */
  actions?: React.ReactNode;
  /** @deprecated artık gösterilmiyor */
  breadcrumbLabel?: string;
  /** @deprecated artık gösterilmiyor */
  eyebrow?: string;
}

export function ToolPageHeader({ title, description, badge, actionButton, children, body, actions }: ToolPageHeaderProps) {
  const desc = description ?? body;
  const action = actionButton ?? actions;
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 border-b border-border pb-6 md:flex-row md:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {badge && <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">{badge}</span>}
        </div>
        {desc && <div className="mt-1 max-w-3xl text-sm text-slate-500">{desc}</div>}
        {children && <div className="mt-2">{children}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export default ToolPageHeader;
