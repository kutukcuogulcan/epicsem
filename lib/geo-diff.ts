/**
 * İki GEO testi arasındaki fark (saf, test edilebilir): aynı soru × motor çiftleri karşılaştırılır.
 * Yalnızca iki testte de bulunan çiftler sayılır; yeni eklenen ya da çıkarılan soru "değişim" sayılmaz
 * (Limelit/Peec notu: soru seti değişince görünürlük oynar ama bu performans değildir).
 */

export type CellStatus = "won" | "mentioned" | "lost" | "empty";

export interface Cell {
  prompt: string;
  engine: string;
  status: CellStatus;
  ownRank: number | null;
  rivals: string[];
  sources: string[];
  /** Sorunun konusu (konu bazında değişim için); yoksa "Genel". */
  topic?: string;
}

export interface RunDiff {
  compared: number;
  gained: { prompt: string; engine: string; from: CellStatus; to: CellStatus }[];
  lost: { prompt: string; engine: string; from: CellStatus; to: CellStatus; rivals: string[] }[];
  visibilityBefore: number;
  visibilityAfter: number;
  /** Rakip başına: kaç cevapta anıldı (önce → sonra). */
  rivals: { name: string; before: number; after: number }[];
  newSources: string[];
  goneSources: string[];
  /** "Neden değişti" (Maya'daki gibi): motor ve konu bazında görünürlük, önce → sonra (yalnızca değişenler, en çok değişen önce). */
  byEngine: { key: string; n: number; before: number; after: number }[];
  byTopic: { key: string; n: number; before: number; after: number }[];
}

const seen = (s: CellStatus) => s === "won" || s === "mentioned";
const score: Record<CellStatus, number> = { won: 3, mentioned: 2, empty: 1, lost: 0 };

export function diffRuns(prev: Cell[], cur: Cell[]): RunDiff {
  const key = (c: Cell) => `${c.prompt}\u0000${c.engine}`;
  const before = new Map(prev.map((c) => [key(c), c]));
  const pairs = cur.filter((c) => before.has(key(c))).map((c) => [before.get(key(c))!, c] as const);
  const gained: RunDiff["gained"] = [];
  const lost: RunDiff["lost"] = [];
  for (const [a, b] of pairs) {
    if (score[b.status] > score[a.status]) gained.push({ prompt: b.prompt, engine: b.engine, from: a.status, to: b.status });
    else if (score[b.status] < score[a.status]) lost.push({ prompt: b.prompt, engine: b.engine, from: a.status, to: b.status, rivals: b.rivals });
  }
  const names = [...new Set(pairs.flatMap(([a, b]) => [...a.rivals, ...b.rivals]))];
  const rivals = names
    .map((name) => ({ name, before: pairs.filter(([a]) => a.rivals.includes(name)).length, after: pairs.filter(([, b]) => b.rivals.includes(name)).length }))
    .filter((r) => r.before !== r.after)
    .sort((x, y) => Math.abs(y.after - y.before) - Math.abs(x.after - x.before));
  const breakdown = (keyOf: (c: Cell) => string) => {
    const m = new Map<string, { n: number; b: number; a: number }>();
    for (const [a, b] of pairs) {
      const e = m.get(keyOf(b)) ?? { n: 0, b: 0, a: 0 };
      e.n++;
      if (seen(a.status)) e.b++;
      if (seen(b.status)) e.a++;
      m.set(keyOf(b), e);
    }
    return [...m.entries()]
      .map(([key, e]) => ({ key, n: e.n, before: e.b / e.n, after: e.a / e.n }))
      .filter((x) => x.before !== x.after)
      .sort((x, y) => Math.abs(y.after - y.before) - Math.abs(x.after - x.before));
  };
  const srcA = new Set(pairs.flatMap(([a]) => a.sources));
  const srcB = new Set(pairs.flatMap(([, b]) => b.sources));
  const n = pairs.length || 1;
  return {
    compared: pairs.length,
    gained,
    lost,
    visibilityBefore: pairs.filter(([a]) => seen(a.status)).length / n,
    visibilityAfter: pairs.filter(([, b]) => seen(b.status)).length / n,
    rivals,
    newSources: [...srcB].filter((s) => !srcA.has(s)).slice(0, 10),
    goneSources: [...srcA].filter((s) => !srcB.has(s)).slice(0, 10),
    byEngine: breakdown((c) => c.engine),
    byTopic: breakdown((c) => c.topic || "Genel"),
  };
}
