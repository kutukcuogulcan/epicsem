"use client";

import { useState } from "react";

/**
 * A copy-to-clipboard prompt block — used by /prompts (static library) and by the
 * "Fix with Claude Code" buttons on /audit and /gap (personalized, generated prompts).
 * Collapsed by default so a page full of prompts doesn't turn into a wall of text.
 */
export default function PromptBlock({
  title,
  description,
  prompt,
  bare = false,
  variant = "card",
}: {
  title: string;
  description?: string;
  prompt: string;
  /** Skip the outer "card" styling — use when this is already nested inside another card. */
  bare?: boolean;
  /** "hero": koyu, öne çıkan şerit (sayfa altındaki "Fix with Claude Code"); "card": açık kart. */
  variant?: "card" | "hero";
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the textarea is
      // still visible and selectable, so the user can copy manually either way.
    }
  }

  if (bare)
    return (
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-sm">{title}</div>
            {description && <p className="text-xs text-ink/50 mt-1">{description}</p>}
          </div>
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted shrink-0">
            {open ? "Gizle" : "Prompt'u göster"}
          </button>
        </div>
        {open && (
          <div className="space-y-2">
            <pre className="whitespace-pre-wrap text-xs text-ink/70 bg-muted rounded-lg p-3 max-h-96 overflow-y-auto">{prompt}</pre>
            <button type="button" onClick={copy} className="text-xs font-semibold rounded-lg bg-accent text-white px-3 py-1.5 hover:opacity-90">
              {copied ? "Kopyalandı!" : "Prompt'u kopyala"}
            </button>
          </div>
        )}
      </div>
    );

  if (variant === "card")
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-panel transition hover:border-accent/30">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 font-mono text-xs font-bold text-accent">&gt;_</span>
            <div>
              <div className="text-sm font-bold">{title}</div>
              {description && <p className="mt-0.5 text-xs leading-relaxed text-ink/50">{description}</p>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink/65 hover:bg-muted">
              {open ? "Gizle" : "Göster"}
            </button>
            <button type="button" onClick={copy} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">
              {copied ? "Kopyalandı ✓" : "Kopyala"}
            </button>
          </div>
        </div>
        {open && <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap border-t border-border bg-muted/40 px-5 py-4 font-mono text-xs leading-relaxed text-ink/70">{prompt}</pre>}
      </div>
    );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-panel">
      <div className="flex flex-col gap-4 bg-gradient-to-r from-ink to-[#2a1b55] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 font-mono text-sm font-bold ring-1 ring-white/15">&gt;_</span>
          <div>
            <div className="text-[15px] font-bold">{title}</div>
            {description && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/60">{description}</p>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-xl border border-white/20 px-3.5 py-2 text-xs font-semibold text-white/85 hover:bg-white/10">
            {open ? "Gizle" : "Prompt'u göster"}
          </button>
          <button type="button" onClick={copy} className="rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-ink hover:opacity-90">
            {copied ? "Kopyalandı ✓" : "Kopyala"}
          </button>
        </div>
      </div>
      {open && <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap bg-muted/50 px-6 py-4 font-mono text-xs leading-relaxed text-ink/70">{prompt}</pre>}
    </div>
  );
}
