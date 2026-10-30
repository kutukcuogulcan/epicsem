import ExampleScenario from "./ExampleScenario";
import FAQSection from "./FAQSection";
import { PAGE_GUIDES } from "@/lib/page-guides";

/** Sayfa altı: "Nasıl çalışır" + SSS — tüm araç sayfalarında aynı görünüm. */
export default function PageGuide({ id }: { id: keyof typeof PAGE_GUIDES }) {
  const g = PAGE_GUIDES[id];
  if (!g) return null;
  return (
    <div className="space-y-10 pt-6">
      <ExampleScenario heading={g.heading} steps={g.steps} />
      <FAQSection items={g.faq} />
    </div>
  );
}
