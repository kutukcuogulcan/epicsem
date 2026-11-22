import { trLower } from "./text-match.ts";

/**
 * "Bu sayfaya ne eklemeli?" (Peec'in ürün sayfası önerisinin karşılığı): AI cevaplarında bu konuda sık geçen
 * kavramlar (kelime ve iki kelimelik ifadeler), sayfada geçmiyorsa listelenir. Kodla, AI yok.
 * Bilgi uydurulmaz: liste "ürününde varsa ekle" diye sunulur, kullanıcı doğrular.
 */

const STOP = new Set(
  (
    "ve veya ile için gibi daha çok en bir bu şu o da de ki mi mı mu mü ne nasıl neden hangi hangisi olan olarak olur olması " +
    "ise ama fakat ancak her tüm bazı birçok kadar sonra önce göre karşı üzerinden üzerine içinde arasında yani hem ya değil " +
    "var yok sizin sen siz biz bunu bunun buna şunu onun ona size bize ayrıca özellikle genellikle mutlaka sadece kendi " +
    "yapabilirsiniz edebilirsiniz sunar sunuyor sağlar sağlıyor kullanabilirsiniz olabilir olmak yapmak etmek eder yapar " +
    "seçenek seçenekler program programı programlar işletme işletmeler işletmeniz firma şirket kullanıcı kullanıcılar " +
    "tamamen yeterli net öneri öneriler pratik dikkat edilecekler edilmesi gerekenler yüzden bu yüzden tarafsız kaç ayda yılda özet sonuç kısaca örneğin öne çıkan çıkar oldukça popüler uygun ihtiyaç ihtiyacınıza ihtiyacınız ihtiyaçlarınıza yaygın kullanılan büyük küçük orta " +
    "iyi güzel kolay kolaylıkla hızlı ücretli ücretsiz farklı çeşitli önemli genel temel tercih tercihi tercih edilen " +
    "türkiye türk türkiye'de dünya yerli yabancı şekilde şekilde açısından bakımından durumda durumunda gerekir gerekiyor " +
    "the and for with from that this your are you can will have has its also more most best"
  ).split(/\s+/)
);

const words = (t: string) =>
  trLower(t)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/['’]\p{L}+/gu, "") // KOBİ'ler → kobi
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w)); // "---" gibi parçalar değil

/** Cevaplarda en az `minDocs` farklı cevapta geçen kavramlar (iki kelimelik ifadeler öncelikli). */
export function answerTerms(answers: string[], exclude: string[] = [], minDocs = 2): { term: string; docs: number }[] {
  const ex = exclude.flatMap((e) => words(e));
  // Çekimli fiil ve yüklemler kavram değildir: "biridir, yoktur, sunuyor, yapabilir, yapanlar".
  const verbish = (w: string) => /(d[ıiuü]r|t[ıiuü]r|yor|[ae]bil[ie]r|m[ae]l[ıi]|[ae]nlar|[ae]nler|m[ae]kt[ae]d[ıi]r)$/.test(w);
  const ok = (w: string) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w) && !ex.includes(w) && !verbish(w);
  const df = new Map<string, number>();
  for (const a of answers) {
    const ws = words(a);
    const seen = new Set<string>();
    for (let i = 0; i < ws.length; i++) {
      if (ok(ws[i]) && ws[i].length >= 4) seen.add(ws[i]);
      if (i + 1 < ws.length && ok(ws[i]) && ok(ws[i + 1])) seen.add(`${ws[i]} ${ws[i + 1]}`);
    }
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  // Tek kelimeler daha gürültülü: en az bir fazla cevapta geçmeli ve 5+ harf olmalı.
  const all = [...df.entries()].filter(([t, n]) => (t.includes(" ") ? n >= minDocs : n >= minDocs + 1 && t.length >= 5));
  // Bir ifadenin parçası olan tek kelime, ifadeyle aynı sıklıktaysa tekrar gösterilmez.
  const bigrams = all.filter(([t]) => t.includes(" "));
  return all
    .filter(([t, n]) => t.includes(" ") || !bigrams.some(([b, bn]) => bn >= n - 1 && b.split(" ").includes(t)))
    .map(([term, docs]) => ({ term, docs }))
    .sort((a, b) => b.docs - a.docs || (b.term.includes(" ") ? 1 : 0) - (a.term.includes(" ") ? 1 : 0))
    .slice(0, 60);
}

/** Sayfa metninde geçmeyen kavramlar (en sık önce). */
export function missingOnPage(terms: { term: string; docs: number }[], pageText: string, max = 15) {
  const page = ` ${words(pageText).join(" ")} `;
  // Türkçe ekler: kökün ilk 5 harfi sayfada kelime başı olarak geçiyorsa "var" say ("faturalandırma" ~ "fatura").
  const has = (t: string) => t.split(" ").every((w) => page.includes(` ${w.length > 6 ? w.slice(0, Math.max(5, w.length - 3)) : w}`));
  return terms.filter((t) => !has(t.term)).slice(0, max);
}
