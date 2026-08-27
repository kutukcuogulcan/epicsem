"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState("/audit");

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) setNextPath(next);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode === "login" ? "login" : "signup"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "login" ? { email, password } : { email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-8 py-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">
          {mode === "login" ? "Giriş yap" : "Hesap oluştur"}
        </h1>
        <p className="text-ink/60 text-sm">
          {mode === "login"
            ? "Epicsem hesabınla devam et."
            : "Ücretsiz hesabını oluştur, verilerin sadece sana ait olsun."}
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-4">
        {mode === "signup" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink/60">İsim (opsiyonel)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Adın"
              className="w-full rounded-lg bg-panel border border-border px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink/60">E-posta</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sen@ajans.com"
            className="w-full rounded-lg bg-panel border border-border px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink/60">Şifre</label>
          <input
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "En az 8 karakter" : "Şifren"}
            className="w-full rounded-lg bg-panel border border-border px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
        </div>

        {error && <div className="text-danger text-sm">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-accent text-white px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "..." : mode === "login" ? "Giriş yap" : "Hesap oluştur"}
        </button>
      </form>

      <p className="text-center text-sm text-ink/60">
        {mode === "login" ? (
          <>
            Hesabın yok mu?{" "}
            <button className="text-accent hover:underline" onClick={() => setMode("signup")}>
              Hesap oluştur
            </button>
          </>
        ) : (
          <>
            Zaten hesabın var mı?{" "}
            <button className="text-accent hover:underline" onClick={() => setMode("login")}>
              Giriş yap
            </button>
          </>
        )}
      </p>
    </div>
  );
}
