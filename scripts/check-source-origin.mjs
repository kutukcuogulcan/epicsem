// Asıl kaynak mı, aktaran mı? Çalıştır: node --experimental-strip-types scripts/check-source-origin.mjs
import assert from "node:assert/strict";
import { isOriginHost } from "../lib/source-origin.ts";

assert.equal(isOriginHost("Pew Research Center", "https://www.pewresearch.org/short-reads/2025/07/22/x"), true);
assert.equal(isOriginHost("Pew Research Center", "https://www.techatom.org/blog/why-isnt-chatgpt-mentioning-my-brand"), false, "aktaran blog");
assert.equal(isOriginHost("Semrush", "https://www.semrush.com/blog/gemini"), true);
assert.equal(isOriginHost("Semrush", "https://digestai.news/story/semrush-guides"), false, "adres yolunda geçmesi yetmez, alan adı olmalı");
assert.equal(isOriginHost("Sprinklr", "https://dev48.org/en/articles/x"), false);
assert.equal(isOriginHost("TÜİK", "https://data.tuik.gov.tr/Bulten/Index?p=1"), true, "Türkçe harf ve tek kelime");
assert.equal(isOriginHost("World Health Organization", "https://www.who.int/news"), true, "baş harfler");
assert.equal(isOriginHost("Bilgi Teknolojileri ve İletişim Kurumu", "https://www.btk.gov.tr/raporlar"), false, "bilinen sınır: kısaltması adından türemiyor");
assert.equal(isOriginHost("", "https://x.com"), true, "kurum bilinmiyorsa iddia yok");
assert.equal(isOriginHost("X", "https://example-blog.com/a"), false, "tek harfli kurum adı her siteyle eşleşmez");
assert.equal(isOriginHost("Acta Orthopaedica et Traumatologica Turcica", "https://aott.org.tr/index.php/pub/article/view/4072"), true, "bağlaç atlanır: aott");
assert.equal(isOriginHost("Hünkar Cagdas Bayrak, Bekir Karagöz", "https://aott.org.tr/x"), false, "yazar adı kurum değil (yayıncıya bakılır)");
console.log("check-source-origin: ok");
{
  const { factNumbers, factOnPage } = await import("../lib/source-origin.ts");
  assert.deepEqual(factNumbers("Chen ve Koudas'a göre ChatGPT sorguların %28'ine marka ekliyor (2025)."), ["28"]);
  assert.deepEqual(factNumbers("32.556 marka bilgisinin %9,2'si yanlış"), ["32.556", "9,2"]);
  assert.equal(factOnPage("sorguların %28'ine marka ekliyor", "we find that 28% of queries add a brand"), true);
  assert.equal(factOnPage("sorguların %28'ine marka ekliyor", "Abstract: a 2016 study of query logs with 1,280 users"), false, "1,280 içindeki 28 sayılmaz");
  assert.equal(factOnPage("Gemini %83,7 oranında anıyor", "Gemini mentioned brands in 83.7% of answers"), true, "virgül/nokta eşdeğer");
  assert.equal(factOnPage("32.556 marka bilgisi incelendi", "We analyzed 32,556 brand facts"), true);
  assert.equal(factOnPage("Kullanıcı sayısı arttı", "herhangi bir metin"), true, "rakamsız bilgi doğrulanamaz, kabul");
  console.log("check-source-origin (rakam doğrulama): ok");
}
{
  const { sourceTier, rankSources } = await import("../lib/source-origin.ts");
  assert.equal(sourceTier("https://data.tuik.gov.tr/Bulten"), 2);
  assert.equal(sourceTier("https://www.pewresearch.org/x"), 2);
  assert.equal(sourceTier("https://dergipark.org.tr/tr/pub/x"), 2);
  assert.equal(sourceTier("https://www.aa.com.tr/tr/x"), 1);
  assert.equal(sourceTier("https://www.openaitoolshub.org/en/blog/x"), 0);
  assert.equal(sourceTier("https://notgov.example.com"), 0, "'.gov' yalnızca sonek olarak");
  const f = (u) => ({ url: u });
  const all = [f("https://blog.example.com/a"), f("https://www.aa.com.tr/b"), f("https://www.pewresearch.org/c"), f("https://www.oecd.org/d")];
  assert.deepEqual(rankSources(all).map((x) => x.url), ["https://www.pewresearch.org/c", "https://www.oecd.org/d", "https://www.aa.com.tr/b"], "3 iyi kaynak varken blog atılır");
  assert.equal(rankSources([f("https://blog.example.com/a"), f("https://www.oecd.org/d")]).length, 2, "iyi kaynak azsa blog tutulur");
  console.log("check-source-origin (otorite): ok");
}
