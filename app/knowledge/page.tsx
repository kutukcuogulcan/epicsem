import ToolPageHeader from "@/components/ToolPageHeader";
import KnowledgeBase from "@/components/KnowledgeBase";

export const metadata = { title: "Bilgi Bankası — Epicsem" };

/** Marka bilgi bankası — Article Writer, Editör, Autoblog ve asistan bu bilgileri doğru kabul eder. */
export default function KnowledgePage() {
  return (
    <div className="space-y-6">
      <ToolPageHeader
        breadcrumbLabel="Bilgi Bankası"
        title="Bilgi Bankası"
        body="Markan hakkındaki doğru bilgileri bir kez yaz: ürünler, fiyat aralığı, kargo ve iade, adres, ton. Yapay zekâ yazarken bunları esas alır, olmayan bilgiyi uydurmaz."
      />
      <div className="rounded-xl border border-border bg-panel shadow-sm p-5">
        <KnowledgeBase />
      </div>
    </div>
  );
}
