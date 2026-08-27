"use client";

import { useState } from "react";
import type { GeneratedFix } from "@/types";

export default function FixCard({ fix }: { fix: GeneratedFix }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(fix.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard API unavailable — user can still select the text manually
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-sm">{fix.label}</div>
        <button
          type="button"
          onClick={copy}
          className="text-xs font-medium rounded-md border border-border px-2.5 py-1 hover:bg-muted transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-sm text-ink/60">{fix.note}</p>
      <pre className="mt-3 bg-muted rounded-lg p-3 text-xs overflow-x-auto whitespace-pre">{fix.code}</pre>
    </div>
  );
}
