"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardHeader, EmptyBlock, ErrorBlock, BTN1, BTN2 } from "@/components/ui";
import { ENGINE_META } from "@/components/tool/MonitorBits";
import { isDemoRun } from "@/lib/geo-loss";
import type { FactIssue } from "@/lib/fact-check";
import type { GeoRunResult } from "@/types";


/** Yanlış bilgi: son GEO testindeki cevapları Bilgi Bankası'yla karşılaştırır. */
export default function FactsTab({ runs, brand }: { runs: GeoRunResult[]; brand: string }) {
  const answers = runs.filter((r) => r.mentioned && !isDemoRun(r) && r.responseText).map((r) => ({ engine: r.engine, prompt: r.promptText, text: r.responseText }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noKb, setNoKb] = useState(false);
  const [res, setRes] = useState<{ checked: number; issues: FactIssue[] } | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/geo/facts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: answers.slice(0, 40) }) });
      const d = await r.json();
      if (d.error === "no-knowledge") return setNoKb(true);
      if (!r.ok) throw new Error(d.error ?? "Kontrol yapılamadı");
      setRes(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kontrol yapılamadı");
    } finally {
      setBusy(false);
    }
  }

  if (!answers.length)
    return (
      <Card>
        <EmptyBlock title="Kontrol edilecek cevap yok" description={`Son testte ${brand} hiçbir gerçek AI cevabında anılmadı (demo cevaplar kontrol edilmez). Markanın anıldığı bir test çalıştırınca burada kontrol edebilirsin.`} />
      </Card>
    );

  if (noKb)
    return (
      <Card>
        <EmptyBlock
          title="Önce Bilgi Bankası'nı doldur"
          description="AI'ın söylediklerini neyle karşılaştıracağımızı bilmemiz gerek: fiyatlar, paketler, özellikler, kuruluş yılı, adres gibi markanla ilgili doğru bilgileri Bilgi Bankası'na yaz."
          action={<Link href="/knowledge" className={BTN1}>Bilgi Bankası&apos;na git</Link>}
        />
      </Card>
    );

  return (
    <Card>
      <CardHeader
        title="AI markan hakkında yanlış bilgi veriyor mu?"
        subtitle={`Son testte ${brand}'ün anıldığı ${answers.length} cevap, Bilgi Bankası'ndaki bilgilerle karşılaştırılır. Yalnızca Bilgi Bankası'nda yazan konular kontrol edilir.`}
        action={
          <button type="button" onClick={check} disabled={busy} className={res ? BTN2 : BTN1}>
            {busy ? "Kontrol ediliyor…" : res ? "Tekrar kontrol et" : "Cevapları kontrol et"}
          </button>
        }
      />
      <ErrorBlock message={error} />
      {!res && !busy && <p className="text-[13px] text-sub">Kontrol 1 AI sorgusu kullanır.</p>}
      {res && res.issues.length === 0 && (
        <p className="rounded-xl bg-seo/10 px-4 py-3 text-sm text-seo-ink">
          Kontrol edilen {res.checked} cevapta Bilgi Bankası&apos;yla çelişen bilgi bulunmadı.
        </p>
      )}
      {res && res.issues.length > 0 && (
        <ul className="space-y-3">
          {res.issues.map((x, i) => (
            <li key={i} className="rounded-xl border border-border p-4 text-[13px]">
              <div className="mb-2 text-xs text-sub">
                <span className="font-medium text-ink">{ENGINE_META[x.engine]?.name ?? x.engine}</span> · &ldquo;{x.prompt}&rdquo; sorusunda
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-lg bg-danger/5 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-danger-ink">AI dedi</div>
                  <div className="mt-0.5">{x.claim}</div>
                </div>
                <div className="rounded-lg bg-seo/5 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-seo-ink">Bilgi Bankan diyor</div>
                  <div className="mt-0.5">{x.truth}</div>
                </div>
              </div>
              {x.why && <p className="mt-2 text-sub">{x.why}</p>}
            </li>
          ))}
          <li className="text-[13px] text-sub">
            Düzeltmek için: bu bilgiyi sitende net ve güncel bir sayfada yaz (fiyat, paket ya da SSS sayfası). AI motorları bilgiyi oradan günceller; etkisini <strong>Etki</strong> sekmesinden takip edebilirsin.
          </li>
        </ul>
      )}
    </Card>
  );
}
