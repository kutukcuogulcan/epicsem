/**
 * GEO öncelikli işlerinin takibi (Peec Actions / Maya action items gibi): AI özetindeki işler kalıcı listeye girer,
 * kullanıcı "yapılıyor / yapıldı / gizle" işaretler; "yapıldı" günündeki görünürlük sonraki testlerle karşılaştırılır.
 */
export type ActionStatus = "open" | "doing" | "done" | "dismissed";

export interface ActionItem {
  id: number;
  domain: string;
  key: string;
  title: string;
  why: string;
  impact: string;
  effort: string;
  status: ActionStatus;
  createdAt: string;
  doneAt: string | null;
  /** "Yapıldı" işaretlendiği andaki görünürlük (0-1). */
  doneVisibility: number | null;
}

/** Aynı işi testten teste eşleştirmek için: küçük harf, Türkçe harfler sadeleşir, noktalama atılır, ilk 12 kelime. */
export function actionKey(title: string): string {
  return title
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .join(" ");
}

/** "Yapıldı"dan sonraki değişim: işaretlenen günkü görünürlük → son test; o tarihten sonra test yoksa null. */
export function sinceDone(item: Pick<ActionItem, "doneAt" | "doneVisibility">, tests: { createdAt: string; visibility: number }[]) {
  if (!item.doneAt || item.doneVisibility == null) return null;
  const after = tests.filter((t) => t.createdAt > item.doneAt!).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!after.length) return { tests: 0, from: item.doneVisibility, to: null as number | null };
  return { tests: after.length, from: item.doneVisibility, to: after[after.length - 1].visibility };
}
