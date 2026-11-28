/** Google İşletme gönderi sınırı: aşarsa son tam cümleden kısaltılır (cümle yoksa kelimeden). */
export function clampPost(text: string, max = 1500): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf("\n"));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" "))).trim();
}

