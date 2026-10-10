"use client";

import { useRef, useState } from "react";
import type { BulkImportResult } from "@/types";

/**
 * Kullanıcının kendi bilgisayarındaki Screaming Frog'u Epicsem'e bağlar. Screaming Frog
 * masaüstü programıdır ve dışarıya veri veren bir API anahtarı yoktur; bu yüzden:
 *  1. Siteye özel bir .bat dosyası üretilir — çift tıklayınca Screaming Frog'un komut satırı
 *     sürümü (ScreamingFrogSEOSpiderCli.exe) siteyi arka planda tarar ve "Internal → All"
 *     sonucunu Masaüstü\epicsem-screaming-frog\internal_all.csv olarak kaydeder.
 *  2. O dosya buraya bırakılır → aynı panoya "SF" etiketiyle düşer.
 */

function buildBat(url: string) {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return [
    "@echo off",
    "chcp 65001 >nul",
    "title Epicsem - Screaming Frog taramasi",
    'set "OUT=%USERPROFILE%\\epicsem-screaming-frog"',
    'set "SF=C:\\Program Files (x86)\\Screaming Frog SEO Spider\\ScreamingFrogSEOSpiderCli.exe"',
    'if not exist "%SF%" set "SF=C:\\Program Files\\Screaming Frog SEO Spider\\ScreamingFrogSEOSpiderCli.exe"',
    'if not exist "%SF%" (',
    "  echo Screaming Frog bulunamadi. Program kurulu mu?",
    "  pause",
    "  exit /b 1",
    ")",
    'if not exist "%OUT%" mkdir "%OUT%"',
    `echo ${target} taraniyor... Bu pencereyi kapatmayin.`,
    `"%SF%" --crawl "${target}" --headless --overwrite --output-folder "%OUT%" --export-tabs "Internal:All"`,
    "echo.",
    "echo Bitti! Simdi Epicsem'de 'internal_all.csv' dosyasini yukleyin.",
    'explorer "%OUT%"',
    "pause",
    "",
  ].join("\r\n");
}

export default function ScreamingFrogConnect({ url, onResult }: { url: string; onResult: (r: BulkImportResult) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  function downloadBat() {
    const v = url.trim();
    if (!v) {
      setHint("Önce yukarıdaki kutuya sitenin adresini yaz.");
      return;
    }
    setHint(null);
    const host = v.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/[^a-z0-9.-]/gi, "");
    const blob = new Blob([buildBat(v)], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `epicsem-screaming-frog-${host || "site"}.bat`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function upload(file: File) {
    if (!/\.csv$/i.test(file.name)) {
      setError("internal_all.csv dosyasını seç (.csv).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/screaming-frog", { method: "POST", body: form });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent("/import")}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Yükleme başarısız oldu");
      onResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme başarısız oldu");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-seo/10 text-xs font-extrabold text-seo">SF</span>
        <div>
          <div className="text-sm font-bold">Screaming Frog ile tara</div>
          <div className="text-xs text-ink/50">Bilgisayarındaki Screaming Frog siteyi tarar, sonuç bu panoya düşer.</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs font-bold text-accent">1. ADIM</div>
          <p className="mt-1 text-sm text-ink/70">Tarama dosyasını indir ve <b>çift tıkla</b>. Screaming Frog siteyi arka planda tarar, bitince sonuç klasörünü açar.</p>
          <button type="button" onClick={downloadBat} className="mt-3 rounded-lg bg-ink px-4 py-2 text-xs font-bold text-white hover:opacity-90">
            Tarama dosyasını indir (.bat)
          </button>
          {hint && <p className="mt-2 text-xs text-warn">{hint}</p>}
          <p className="mt-2 text-[11px] text-ink/40">Windows uyarı verirse “Ek bilgi → Yine de çalıştır”. Bitince sonuç klasörü kendiliğinden açılır.</p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) upload(f);
          }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-4 transition-colors ${drag ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"}`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <div className="text-xs font-bold text-accent">2. ADIM</div>
          <p className="mt-1 text-sm text-ink/70">
            {busy ? "Yükleniyor…" : <>Çıkan <b>internal_all.csv</b> dosyasını buraya sürükle ya da tıklayıp seç.</>}
          </p>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}
