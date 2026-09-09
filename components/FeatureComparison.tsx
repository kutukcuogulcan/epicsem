import { TOOL_ICONS } from "./ToolIcons";

/**
 * "Without vs. with" comparison block — mirrors arvow.com's two-panel
 * before/after sections (e.g. arvow.com/google-review-automation). Arvow
 * illustrates each side with a fabricated dashboard mockup; this app's own
 * design rule is to never invent a screenshot of something that didn't
 * happen (see BrowserFrame's comment), so both sides here are plain,
 * honestly-labeled text comparisons instead of staged UI — same structure,
 * without the invented "after" screenshot.
 */
export default function FeatureComparison({
  without,
  withItems,
}: {
  without: { title: string; items: string[] };
  withItems: { title: string; items: string[] };
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-border bg-panel/60 p-6 space-y-4">
        <div className="text-sm font-bold text-ink/50">{without.title}</div>
        <ul className="space-y-3">
          {without.items.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-ink/60">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border-2 border-accent/40 bg-accent/[0.04] p-6 space-y-4">
        <div className="text-sm font-bold text-accent">{withItems.title}</div>
        <ul className="space-y-3">
          {withItems.items.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-ink/80 font-medium">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                {TOOL_ICONS.check}
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
