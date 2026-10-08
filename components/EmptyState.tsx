import Link from "next/link";
import type { ReactNode } from "react";

/** Arvow-style empty state: icon, one sentence, one action. */
export default function EmptyState({
  title,
  body,
  actionLabel,
  actionHref,
  icon,
}: {
  title: string;
  body?: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center text-center gap-3 py-10">
      <span className="h-12 w-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
        {icon ?? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <path d="M10 4v12M4 10h12" />
          </svg>
        )}
      </span>
      <div className="font-bold">{title}</div>
      {body && <p className="text-sm text-ink/50 max-w-md">{body}</p>}
      {actionLabel && actionHref && (
        <Link href={actionHref} className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-bold hover:opacity-90">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
