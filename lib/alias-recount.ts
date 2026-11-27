import type { GeoRunResult } from "../types";
import { brandMentioned } from "./text-match.ts";

/**
 * Alt markalar (Pro Plan, Felix…) sonradan eklendiğinde eski GEO cevaplarındaki "anıldı" bilgisini yeniden sayar.
 * Yalnızca anılmamış cevaplar alt markayla anılmış olabilir; anılmış hiçbir cevap geri alınmaz.
 */
export function recountWithAliases(runs: GeoRunResult[], brand: { name: string; aliases: string[] }): GeoRunResult[] {
  if (!brand.aliases.length) return runs;
  return runs.map((r) => (r.mentioned || !r.responseText || !brandMentioned(r.responseText, brand) ? r : { ...r, mentioned: true }));
}
