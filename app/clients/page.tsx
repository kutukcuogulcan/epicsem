"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Breadcrumb from "@/components/Breadcrumb";

interface BrandRow {
  name: string;
  domain: string;
}

interface Client {
  id: number;
  name: string;
  domain: string;
  competitors: BrandRow[];
  notes: string | null;
  createdAt: string;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [competitors, setCompetitors] = useState<BrandRow[]>([{ name: "", domain: "" }]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function redirectToLogin() {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }

  async function refresh() {
    const res = await fetch("/api/clients");
    if (res.status === 401) {
      redirectToLogin();
      return;
    }
    const data = await res.json();
    setClients(data.clients ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  function updateCompetitor(i: number, field: keyof BrandRow, value: string) {
    setCompetitors((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !domain.trim()) {
      setError("Enter a client name and domain.");
      return;
    }
    setBusy("add");
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          domain,
          competitors: competitors.filter((c) => c.name && c.domain),
          notes: notes || undefined,
        }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save client");
      setName("");
      setDomain("");
      setCompetitors([{ name: "", domain: "" }]);
      setNotes("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function removeClient(id: number) {
    setBusy(`remove-${id}`);
    try {
      const res = await fetch("/api/clients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: "Ana Sayfa", href: "/" }, { label: "Clients" }]} />
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="text-ink/60 text-sm">
          Save each client's brand and competitor set once — jump straight into a pre-filled Audit, GEO test, or
          Gap Analysis instead of retyping it every time, and generate an Epicsem-branded PDF report from any run.
        </p>
      </div>

      <form onSubmit={addClient} className="card space-y-3">
        <h2 className="font-medium text-sm">Add a client</h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Client / brand name"
            required
            className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="client-domain.com"
            required
            className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-ink/50">Competitors</span>
          <button
            type="button"
            onClick={() => setCompetitors((c) => [...c, { name: "", domain: "" }])}
            className="text-xs text-accent hover:underline"
          >
            + Add competitor
          </button>
        </div>
        {competitors.map((c, i) => (
          <div key={i} className="grid grid-cols-2 gap-3">
            <input
              value={c.name}
              onChange={(e) => updateCompetitor(i, "name", e.target.value)}
              placeholder="Competitor name"
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={c.domain}
              onChange={(e) => updateCompetitor(i, "domain", e.target.value)}
              placeholder="competitor-domain.com"
              className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        ))}

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional) — account contact, contract scope, anything worth remembering"
          rows={2}
          className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <button
          type="submit"
          disabled={busy === "add"}
          className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy === "add" ? "Saving…" : "Save client"}
        </button>
      </form>

      {error && <div className="card border-danger/40 text-danger text-sm">{error}</div>}

      {clients && clients.length > 0 && (
        <div className="space-y-3">
          {clients.map((c) => (
            <div key={c.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">{c.name}</div>
                  <div className="text-xs text-ink/40">{c.domain}</div>
                </div>
                <button
                  onClick={() => removeClient(c.id)}
                  disabled={busy === `remove-${c.id}`}
                  className="text-xs text-danger/70 hover:text-danger"
                >
                  Remove
                </button>
              </div>
              {c.competitors.length > 0 && (
                <div className="text-xs text-ink/50">
                  vs {c.competitors.map((comp) => comp.name).join(", ")}
                </div>
              )}
              {c.notes && <p className="text-xs text-ink/50">{c.notes}</p>}
              <div className="flex gap-3 pt-1 text-xs">
                <Link href={`/audit?clientId=${c.id}`} className="text-accent hover:underline">Audit</Link>
                <Link href={`/geo?clientId=${c.id}`} className="text-accent hover:underline">GEO test</Link>
                <Link href={`/gap?clientId=${c.id}`} className="text-accent hover:underline">Gap analysis</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {clients && clients.length === 0 && (
        <div className="card text-sm text-ink/50">No clients saved yet — add one above.</div>
      )}
    </div>
  );
}
