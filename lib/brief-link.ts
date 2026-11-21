import type { ContentBrief } from "@/lib/geo-brief";

/** Yazı sihirbazına giden plan + not (URL'de taşınır; editör bu planla doğrudan "Plan" adımında açılır). */
export function briefToWriterLink(b: ContentBrief, keyword: string): string {
  const plan = {
    outline: b.sections.map((s) => ({ h2: s.h2, h3: [], note: [s.angle, ...s.points].join(" ").slice(0, 400) })),
    questions: b.faq,
  };
  const note = [
    `Ana soru: ${b.mainQuestion}. Açı: ${b.angle}`,
    b.proofPoints.length ? `Kanıt noktaları: ${b.proofPoints.join("; ")}` : "",
    b.neverWrite.length ? `Kullanma: ${b.neverWrite.join(", ")}` : "",
    b.sources.length ? `AI'ın baktığı kaynaklar: ${b.sources.slice(0, 5).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 700);
  return `/editor?write=1&kw=${encodeURIComponent(keyword.replace(/[?!.]+$/, "").slice(0, 100))}&title=${encodeURIComponent((b.h1Options[0] ?? b.mainQuestion).slice(0, 200))}&note=${encodeURIComponent(note)}&plan=${encodeURIComponent(JSON.stringify(plan))}`;
}
