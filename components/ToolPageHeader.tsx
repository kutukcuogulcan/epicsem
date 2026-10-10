import Breadcrumb from "./Breadcrumb";

/**
 * Araç sayfası başlığı — arvow/ahrefs tarzı sade, premium üst şerit: küçük breadcrumb,
 * net başlık, tek satır açıklama, sağda eylem alanı. Dekoratif blob/radar yok; sayfanın
 * asıl "vitrini" hemen altındaki grafikler ve tablolar.
 */
export default function ToolPageHeader({
  breadcrumbLabel,
  title,
  body,
  children,
  actions,
}: {
  breadcrumbLabel: string;
  title: string;
  body: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  /** Geriye uyumluluk için kabul edilir, artık gösterilmiyor. */
  eyebrow?: string;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: breadcrumbLabel }]} />
        <h1 className="text-2xl sm:text-[1.75rem] font-extrabold tracking-tight">{title}</h1>
        <div className="max-w-2xl text-sm text-ink/55">{body}</div>
        {children && <div className="pt-1">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
