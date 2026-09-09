"use client";

import { useState } from "react";
import UsageMeter from "@/components/UsageMeter";
import ToolPageHeader from "@/components/ToolPageHeader";
import FAQSection from "@/components/FAQSection";
import ExampleScenario from "@/components/ExampleScenario";

const SCENARIO_STEPS = [
  {
    title: "Konu veya yorumu girin",
    body: "\"Bu hafta sonu kampanyamız var\" gibi kısa bir konu, ya da müşterinin bıraktığı gerçek yorum metni.",
  },
  {
    title: "Taslak AI ile üretilir",
    body: "Model, işletme adı ve domaininiz dışında hiçbir bilgiyi uydurmadan (fiyat, kampanya detayı, isim vb. yok) doğal bir taslak yazar.",
  },
  {
    title: "Kopyalayıp yapıştırırsınız",
    body: "Taslağı kopyalayıp Google Business Profile'da \"Güncelleme ekle\" veya ilgili yorumun altına siz yapıştırırsınız — hiçbir şey otomatik gönderilmez.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Bu, Google Business Profile'a otomatik mi gönderiyor?",
    a: "Hayır. Google'ın Business Profile API'si onay/inceleme gerektiriyor ve bunu anında garanti edemeyiz — o yüzden dürüst bir seçim yaptık: bu araç sadece taslak metni üretir, siz kopyalayıp Google Business Profile'a kendiniz yapıştırırsınız. WordPress/Shopify yayınlarımızdaki \"insan onayı olmadan hiçbir şey canlıya çıkmaz\" ilkesiyle aynı mantık.",
  },
  {
    q: "Metinler uyduruluyor mu?",
    a: "Hayır — model işletme adınız ve domaininiz dışında hiçbir somut bilgiyi (fiyat, kampanya, tarih, çalışan adı vb.) icat etmemesi için yönlendiriliyor. Böyle bir detay gerekiyorsa genel bir ifade kullanır, uydurmaz.",
  },
  {
    q: "Olumsuz bir yoruma nasıl yanıt üretiyor?",
    a: "Savunmacı olmadan yorumdaki somut şikayeti kabul eden, iletişimi özelden devam ettirmeye davet eden bir üslup kullanır — yasal sorumluluk kabul eden ifadeler kullanmaz.",
  },
  {
    q: "Aylık kaç taslak üretebilirim?",
    a: "İçerik Stüdyosu ile aynı kotayı paylaşır: ücretsiz planda ayda 20 üretim hakkı. Demo modda (API anahtarı tanımlı değilken) üretim bu kotadan düşmez.",
  },
];

function useDraftGenerator() {
  const [text, setText] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/local/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Üretim başarısız oldu");
      setText(data.text);
      setDemoMode(data.demoMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti");
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return { text, demoMode, loading, error, copied, run, copy };
}

export default function LocalToolsPage() {
  const [brandName, setBrandName] = useState("");
  const [brandDomain, setBrandDomain] = useState("");

  const [topic, setTopic] = useState("");
  const gbp = useDraftGenerator();

  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState<number | "">("");
  const reply = useDraftGenerator();

  const brandReady = brandName.trim().length > 0 && brandDomain.trim().length > 0;

  return (
    <div className="space-y-8 max-w-3xl">
      <ToolPageHeader
        breadcrumbLabel="Yerel İşletme"
        title="Yerel İşletme Araçları"
        body={
          <>
            Google Business Profile gönderisi ve müşteri yorumlarına yanıt taslağı üretir. Bu araç Google&apos;a{" "}
            <strong>hiçbir şeyi otomatik göndermez</strong> — Google Business Profile API&apos;sinin gerektirdiği onay
            sürecine sahip değiliz, o yüzden bunu sahte bir otomasyon gibi göstermek yerine dürüst bir taslak
            oluşturucu olarak sunuyoruz: metni üretir, kopyalayıp Google Business Profile&apos;a siz yapıştırırsınız.
          </>
        }
      >
        <UsageMeter metric="contentGenerations" />
      </ToolPageHeader>

      <div className="card space-y-3">
        <h2 className="font-bold text-sm">İşletme bilgisi</h2>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="İşletme adı"
            className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            value={brandDomain}
            onChange={(e) => setBrandDomain(e.target.value)}
            placeholder="domain.com"
            className="rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-bold">Google Business Profile gönderisi</h2>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Konu (örn. hafta sonu kampanyası, yeni ürün, çalışma saati değişikliği...)"
          rows={2}
          className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={!brandReady || !topic.trim() || gbp.loading}
          onClick={() => gbp.run({ kind: "gbp-post", brandName, brandDomain, topic })}
          className="text-sm font-semibold rounded-lg bg-accent text-white px-4 py-2 hover:opacity-90 disabled:opacity-50"
        >
          {gbp.loading ? "Üretiliyor…" : "Taslak üret"}
        </button>
        {gbp.error && <div className="text-xs text-danger">{gbp.error}</div>}
        {gbp.text && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs text-ink/40">
              {gbp.demoMode ? "Simüle edildi — API anahtarı tanımlı değil." : "Kopyalayıp Google Business Profile'da \"Güncelleme ekle\"ye yapıştırın."}
            </p>
            <pre className="whitespace-pre-wrap text-sm text-ink/80 bg-muted rounded-lg p-3 font-sans">{gbp.text}</pre>
            <button type="button" onClick={gbp.copy} className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
              {gbp.copied ? "Kopyalandı ✓" : "Kopyala"}
            </button>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-bold">Yorum yanıtı</h2>
        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Müşterinin bıraktığı yorum metnini buraya yapıştırın"
          rows={4}
          className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink/50">Puan (opsiyonel):</label>
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value ? Number(e.target.value) : "")}
            className="text-sm rounded-lg bg-muted border border-border px-2 py-1.5 outline-none"
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((r) => (
              <option key={r} value={r}>{r} yıldız</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!brandReady || !reviewText.trim() || reply.loading}
          onClick={() => reply.run({ kind: "review-reply", brandName, brandDomain, reviewText, rating: rating || undefined })}
          className="text-sm font-semibold rounded-lg bg-accent text-white px-4 py-2 hover:opacity-90 disabled:opacity-50"
        >
          {reply.loading ? "Üretiliyor…" : "Yanıt taslağı üret"}
        </button>
        {reply.error && <div className="text-xs text-danger">{reply.error}</div>}
        {reply.text && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs text-ink/40">
              {reply.demoMode ? "Simüle edildi — API anahtarı tanımlı değil." : "Kopyalayıp yorumun altındaki yanıt kutusuna yapıştırın."}
            </p>
            <pre className="whitespace-pre-wrap text-sm text-ink/80 bg-muted rounded-lg p-3 font-sans">{reply.text}</pre>
            <button type="button" onClick={reply.copy} className="text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
              {reply.copied ? "Kopyalandı ✓" : "Kopyala"}
            </button>
          </div>
        )}
      </div>

      <ExampleScenario heading="Bir yorumdan, kopyala-yapıştıra hazır bir yanıta" steps={SCENARIO_STEPS} />

      <FAQSection items={FAQ_ITEMS} />
    </div>
  );
}
