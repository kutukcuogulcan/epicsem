"use client";

import { useEffect, useState } from "react";
import ToolPageHeader from "@/components/ToolPageHeader";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";
import UsageMeter from "@/components/UsageMeter";

const SCENARIO_STEPS = [
  {
    title: "Bir domain için Gap Analysis çalıştırılır",
    body: "Bu, kampanyanın konu havuzunu doldurur — gerçek kayıp promptlar ve içerik boşlukları.",
  },
  {
    title: "O domain için bir kampanya kurulur",
    body: "Marka adı, domain ve sıklık (haftalık/aylık) seçilir, \"Kampanyayı başlat\" ile aktif edilir.",
  },
  {
    title: "GitHub Actions her 6 saatte bir kontrol eder",
    body: "Kampanya süresi dolmuşsa (örn. son çalışmadan 7 gün geçmişse), Gap Analysis'teki bir sonraki kullanılmamış konu otomatik makaleye çevrilir.",
  },
  {
    title: "Taslak olarak Content Studio'da belirir",
    body: "Otomatik üretilen makale de her zamanki gibi bir taslaktır — direkt yayına çıkmaz, [NEEDS: ...] alanları doldurulup gözden geçirilmesi gerekir.",
  },
  {
    title: "Konular biterse kampanya bekler",
    body: "Son Gap Analysis'teki tüm konular taslağa dönüştüyse, kampanya durumunda bunu belirtir — yeni konu için Gap Analysis'i tekrar çalıştırman yeterli.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Kampanya konuları nereden geliyor, uyduruluyor mu?",
    a: "Hayır. Her kampanya, o domain için en son çalıştırdığın Gap Analysis sonucundaki gerçek content brief'leri (kayıp promptlar, teknik içerik boşlukları) sırayla kullanır. Hiçbir zaman serbest bir anahtar kelimeden makale üretmez.",
  },
  {
    q: "Otomatik üretilen makale direkt yayınlanıyor mu?",
    a: "Hayır — her zamanki gibi bir taslak olarak Content Studio'da belirir. Yayınlama kararı ve WordPress/Shopify'a gönderme her zaman senin elinle olur.",
  },
  {
    q: "Ne sıklıkla çalışıyor?",
    a: "GitHub Actions'taki otomasyon her 6 saatte bir tüm aktif kampanyaları kontrol eder, ama bir kampanya sadece kendi sıklığı (haftalık = 7 gün, aylık = 30 gün) dolduğunda gerçekten yeni bir taslak üretir — aradaki kontroller çoğunlukla hiçbir şey yapmaz.",
  },
  {
    q: "Gap Analysis'teki konular biterse ne olur?",
    a: "Kampanya o dönem için atlanır ve durumunda bunu açıkça belirtir (\"tüm konular kullanıldı, Gap Analysis'i tekrar çalıştır\") — asla uydurma bir konuya geçmez.",
  },
];

interface Campaign {
  id: number;
  brandName: string;
  brandDomain: string;
  frequency: "weekly" | "monthly";
  status: "active" | "paused";
  lastRunAt: string | null;
  lastRunNote: string | null;
  createdAt: string;
}

const FREQUENCY_LABEL: Record<Campaign["frequency"], string> = {
  weekly: "Haftalık",
  monthly: "Aylık",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandDomain, setBrandDomain] = useState("");
  const [frequency, setFrequency] = useState<Campaign["frequency"]>("weekly");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function redirectToLogin() {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }

  async function refresh() {
    const res = await fetch("/api/campaigns");
    if (res.status === 401) {
      redirectToLogin();
      return;
    }
    const data = await res.json();
    setCampaigns(data.campaigns ?? []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!brandName.trim() || !brandDomain.trim()) {
      setError("Bir marka adı ve domain girin.");
      return;
    }
    setBusy("add");
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName, brandDomain, frequency }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Kampanya oluşturulamadı");
      setBrandName("");
      setBrandDomain("");
      setFrequency("weekly");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus(c: Campaign) {
    setBusy(`toggle-${c.id}`);
    try {
      const res = await fetch("/api/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, status: c.status === "active" ? "paused" : "active" }),
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

  async function runNow(id: number) {
    setBusy(`run-${id}`);
    setError(null);
    try {
      const res = await fetch("/api/campaigns/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Kampanya çalıştırılamadı");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setBusy(null);
    }
  }

  async function removeCampaign(id: number) {
    setBusy(`remove-${id}`);
    try {
      const res = await fetch("/api/campaigns", {
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
      <ToolPageHeader
        breadcrumbLabel="Kampanyalar"
        title="Kampanyalar"
        body={
          <>
            Bir kere kur, arkasında çalışsın: bir domain için kampanya kurduğunda, o domainin en son Gap
            Analysis sonucundaki gerçek içerik boşlukları haftalık/aylık olarak otomatik taslak makaleye
            dönüşür — GitHub Actions üzerinden, elle tetiklemene gerek kalmadan. Hiçbir zaman uydurma bir
            konu kullanmaz ve hiçbir zaman doğrudan yayınlamaz, her zaman gözden geçirilecek bir taslak
            üretir.
          </>
        }
      >
        <UsageMeter metric="contentGenerations" />
      </ToolPageHeader>

      <form onSubmit={addCampaign} className="card space-y-3">
        <h2 className="font-bold text-sm">Bir kampanya kur</h2>
        <p className="text-xs text-ink/40">
          Not: Bu domain için önce en az bir kez Gap Analysis çalıştırmış olman gerekir — kampanya konularını
          oradan alır.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Marka adı"
            required
            className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            value={brandDomain}
            onChange={(e) => setBrandDomain(e.target.value)}
            placeholder="domaininiz.com"
            required
            className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Campaign["frequency"])}
            className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="weekly">Haftalık</option>
            <option value="monthly">Aylık</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy === "add"}
          className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {busy === "add" ? "Kuruluyor…" : "Kampanyayı başlat"}
        </button>
      </form>

      {error && <div className="card border-danger/40 text-danger text-sm">{error}</div>}

      {campaigns && campaigns.length > 0 && (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    {c.brandName}
                    <span
                      className={`badge ${c.status === "active" ? "bg-seo/10 text-seo" : "bg-muted text-ink/50"}`}
                    >
                      {c.status === "active" ? "Aktif" : "Duraklatıldı"}
                    </span>
                  </div>
                  <div className="text-xs text-ink/40">{c.brandDomain} · {FREQUENCY_LABEL[c.frequency]}</div>
                </div>
                <div className="flex items-center gap-2 text-xs shrink-0">
                  <button
                    onClick={() => runNow(c.id)}
                    disabled={busy === `run-${c.id}`}
                    className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50"
                  >
                    {busy === `run-${c.id}` ? "Çalışıyor…" : "Şimdi çalıştır"}
                  </button>
                  <button
                    onClick={() => toggleStatus(c)}
                    disabled={busy === `toggle-${c.id}`}
                    className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50"
                  >
                    {c.status === "active" ? "Duraklat" : "Devam ettir"}
                  </button>
                  <button
                    onClick={() => removeCampaign(c.id)}
                    disabled={busy === `remove-${c.id}`}
                    className="text-danger/70 hover:text-danger px-1"
                  >
                    Sil
                  </button>
                </div>
              </div>
              <div className="text-xs text-ink/50">
                {c.lastRunAt
                  ? `Son çalışma: ${new Date(c.lastRunAt).toLocaleString("tr-TR")}`
                  : "Henüz hiç çalışmadı — bir sonraki otomatik taramada (en geç 6 saat içinde) ilk kez çalışacak."}
              </div>
              {c.lastRunNote && <div className="text-xs text-ink/40 border-t border-border pt-2">{c.lastRunNote}</div>}
            </div>
          ))}
        </div>
      )}

      {campaigns && campaigns.length === 0 && (
        <div className="card space-y-2">
          <div className="text-sm font-medium">Henüz kampanya kurulmadı</div>
          <p className="text-xs text-ink/50">
            Önce bir domain için Gap Analysis çalıştır, sonra yukarıdan aynı domain için bir kampanya kur —
            oradaki gerçek content brief'lerden otomatik taslak üretmeye başlar.
          </p>
        </div>
      )}

      <ExampleScenario heading="Bir ajans 3 müşteri için kampanya kurup unutuyor" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />
    </div>
  );
}
