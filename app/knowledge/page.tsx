import { PageHeader } from "@/components/ui";
import KnowledgeBase from "@/components/KnowledgeBase";
import Link from "next/link";

export const metadata = { title: "Bilgi Bankası — Epicsem" };

/** Marka bilgi bankası — Sayfa Analizi, Editör, Autoblog ve asistan bu bilgileri doğru kabul eder. */
export default function KnowledgePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Yapay zekâ markan hakkında neyi doğru bilsin?"
        description="Ürünler, fiyat aralığı, kargo ve iade, adres, ton… Bir kez yaz; yazılar, yorum yanıtları ve öneriler bunları esas alır, olmayan bilgiyi uydurmaz. Seçili projeye kaydedilir."
        actions={
          <Link href="/project" className="inline-flex h-8 items-center rounded-[10px] bg-panel px-3 text-sm font-medium shadow-[inset_0_0_0_1px_#D5D7DA,0_1px_2px_rgba(13,18,28,0.05)] hover:bg-muted">
            Proje ayarları
          </Link>
        }
      />
      <KnowledgeBase />
    </div>
  );
}
