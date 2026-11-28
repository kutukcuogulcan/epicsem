"use client";

import { useEffect, useState } from "react";
import type { PromptSuggestion } from "@/lib/prompt-suggest";
import { Card, CardHeader } from "@/components/ui";

/** Peec tarzı soru önerisi: AI motorlarının aramalarından, takip edilmeyen konularda yeni sorular; "Takibe ekle" haftalık izlemeye ekler. */
export default function PromptSuggestions({ testAt }: { testAt?: string | null }) {
  const [list, setList] = useState<PromptSuggestion[] | null>(null);
  const [domain, setDomain] = useState("");
  const [tracked, setTracked] = useState<string[]>([]);
  const [monitorActive, setMonitorActive] = useState(false);
  const [state, setState] = useState<"loading" | "writing" | "ready" | "error" | "none">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let off = false;
    (async () => {
      const g = await fetch("/api/geo/prompt-suggestions").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (off) return;
      if (!g || !g.domain) return setState("none");
      setDomain(g.domain);
      setTracked(g.tracked ?? []);
      setMonitorActive(!!g.monitorActive);
      if (g.suggestions) return setList(g.suggestions), setState("ready");
      setState("writing");
      const r = await fetch("/api/geo/prompt-suggestions", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (off) return;
      if (r.ok) {
        setList(d.suggestions ?? []);
        setState("ready");
        window.dispatchEvent(new Event("epicsem:usage-changed"));
      } else {
        setMsg(d.error ?? "Öneriler üretilemedi");
        setState("error");
      }
    })();
    return () => {
      off = true;
    };
  }, [testAt]);

  const add = async (p: PromptSuggestion) => {
    setMsg("");
    const r = await fetch("/api/brand-monitors/schedule", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, addPrompt: { text: p.text, topic: p.topic } }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setTracked(d.schedule?.prompts?.map((x: { text: string }) => x.text) ?? [...tracked, p.text]);
    else setMsg(d.error ?? "Eklenemedi");
  };

  if (state === "none" || (state === "ready" && !list?.length)) return null;
  const topics = [...new Set((list ?? []).map((x) => x.topic))];
  return (
    <Card>
      <CardHeader
        title="Önerilen sorular"
        subtitle="AI motorlarının bu konuda yaptığı aramalardan, henüz takip etmediğin sorular. Takibe eklediğin soru haftalık otomatik izlemede sorulur."
      />
      {state === "writing" || state === "loading" ? (
        <p className="mt-3 text-sm text-sub" aria-busy="true">
          {state === "writing" ? "Öneriler hazırlanıyor… (1 AI sorgusu, bu test için bir kez)" : "Yükleniyor…"}
        </p>
      ) : state === "error" ? (
        <p className="mt-3 text-sm text-danger-ink">{msg}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {topics.map((t) => (
            <div key={t}>
              <p className="text-xs font-medium text-sub">{t}</p>
              <ul className="mt-1.5 space-y-2">
                {list!.filter((x) => x.topic === t).map((x) => {
                  const on = tracked.includes(x.text);
                  return (
                    <li key={x.text} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="text-ink">{x.text}</p>
                        {x.why && <p className="text-xs text-sub">{x.why}</p>}
                      </div>
                      <button
                        type="button"
                        disabled={on}
                        onClick={() => add(x)}
                        className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${on ? "border-seo bg-seo/10 text-seo-ink" : "border-border text-ink hover:border-accent hover:text-accent"}`}
                      >
                        {on ? "Takipte ✓" : "+ Takibe ekle"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {msg && <p className="text-sm text-danger-ink">{msg}</p>}
          {!monitorActive && <p className="text-xs text-sub">Not: Otomatik izleme bu projede kapalı; eklenen sorular izleme açılınca sorulur (Marka Monitörleri).</p>}
        </div>
      )}
    </Card>
  );
}
