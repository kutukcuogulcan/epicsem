import { TOOL_ICONS } from "./ToolIcons";

/**
 * Icon-tile bullet grid for the /features/* pages — every item gets an
 * identical accent-circle check icon + title + one-line body, same visual
 * weight throughout (see arvow.com's "why Arvow" bullet lists). Replaces the
 * plain text-only cards these pages used before, which had no icon at all.
 */
export default function FeatureGrid({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((f) => (
        <div key={f.title} className="card flex gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            {TOOL_ICONS.check}
          </span>
          <div>
            <div className="font-semibold text-sm">{f.title}</div>
            <p className="mt-1 text-sm text-ink/60">{f.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
