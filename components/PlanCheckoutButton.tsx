"use client";

import { useState } from "react";

/** Starts Stripe Checkout (plan) or opens the Customer Portal (no plan). */
export default function PlanCheckoutButton({
  plan,
  label,
  variant = "primary",
  disabled,
}: {
  plan?: "pro" | "agency";
  label: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(plan ? "/api/billing/checkout" : "/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: plan ? JSON.stringify({ plan }) : undefined,
      });
      if (res.status === 401) {
        window.location.href = "/login?next=/billing";
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "İşlem başlatılamadı");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başlatılamadı");
      setLoading(false);
    }
  }

  const cls =
    variant === "primary"
      ? "bg-accent text-white hover:opacity-90"
      : "border border-border text-ink/80 hover:bg-muted";

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={go}
        disabled={disabled || loading}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 ${cls}`}
      >
        {loading ? "Yönlendiriliyor…" : label}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
