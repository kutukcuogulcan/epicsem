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
}: {
  title: string;
  description?: string;
  prompt: string;
  /** Skip the outer "card" styling — use when this is already nested inside another card. */
  bare?: boolean;
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

  return (
    <div className={bare ? "space-y-2 border-t border-border pt-3" : "card space-y-2"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-sm">{title}</div>
          {description && <p className="text-xs text-ink/50 mt-1">{description}</p>}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted shrink-0"
        >
          {open ? "Hide" : "Show prompt"}
        </button>
      </div>
      {open && (
        <div className="space-y-2">
          <pre className="whitespace-pre-wrap text-xs text-ink/70 bg-muted rounded-lg p-3 max-h-96 overflow-y-auto">
            {prompt}
          </pre>
          <button
            type="button"
            onClick={copy}
            className="text-xs rounded-lg bg-accent text-white px-3 py-1.5 hover:opacity-90"
          >
            {copied ? "Copied!" : "Copy prompt"}
          </button>
        </div>
      )}
    </div>
  );
}
