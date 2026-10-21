/**
 * Marka varlık kontrolü — Wikipedia ve Wikidata. AI motorları bir markayı "tanırken" en çok
 * bu iki kaynağa dayanır (bilgi grafı). Ücretsiz, anahtarsız resmi MediaWiki API'leri.
 * Fikir: geo-seo-claude brand_scanner.py (MIT); eşleştirme resmi site (P856) ile güçlendirildi.
 */

const UA = "EpicsemEntityCheck/1.0 (https://epicsem-web.onrender.com)";
const T = () => AbortSignal.timeout(12_000);

const hostOf = (u: string) => {
  try {
    return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

async function getJson(url: string, stats?: { ok: number; fail: number }): Promise<any> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: T() });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (stats) stats.ok++;
    return j;
  } catch (e) {
    if (stats) stats.fail++;
    throw e;
  }
}

export interface EntityResult {
  brand: string;
  domain: string;
  wikidata: null | {
    id: string;
    label: string;
    description: string;
    url: string;
    /** Wikidata'daki resmi site (P856) bu domain mi? Değilse eşleşme zayıftır. */
    websiteMatch: boolean;
    facts: { logo: boolean; inception: boolean; industry: boolean; hq: boolean; social: string[] };
    claims: number;
  };
  wikipedia: { lang: "tr" | "en"; title: string; url: string; fromWikidata: boolean }[];
  score: number;
  tips: string[];
}

const SOCIAL: Record<string, string> = { P2002: "X/Twitter", P2003: "Instagram", P2013: "Facebook", P4264: "LinkedIn", P2397: "YouTube" };

export async function checkEntity(brand: string, domain: string): Promise<EntityResult> {
  const host = hostOf(domain);
  const out: EntityResult = { brand, domain: host, wikidata: null, wikipedia: [], score: 0, tips: [] };
  const st = { ok: 0, fail: 0 };

  // 1) Wikidata: TR ve EN aramada ilk adaylar → resmi site eşleşmesi olanı seç.
  const ids = new Set<string>();
  for (const lang of ["tr", "en"]) {
    try {
      const j = await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&limit=5&type=item&language=${lang}&uselang=${lang}&search=${encodeURIComponent(brand)}`, st);
      for (const s of j.search ?? []) ids.add(s.id);
    } catch {
      /* yoksay */
    }
  }
  if (ids.size) {
    try {
      const j = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|descriptions|claims|sitelinks&languages=tr|en&ids=${[...ids].slice(0, 10).join("|")}`, st);
      const ents = Object.values<any>(j.entities ?? {});
      const site = (e: any): string[] => (e.claims?.P856 ?? []).map((c: any) => hostOf(String(c.mainsnak?.datavalue?.value ?? ""))).filter(Boolean);
      const matched = ents.find((e) => host && site(e).some((h) => h === host || h.endsWith(`.${host}`) || host.endsWith(`.${h}`)));
      const nameLc = brand.toLocaleLowerCase("tr");
      const byName = ents.find((e) => [e.labels?.tr?.value, e.labels?.en?.value].some((l) => l && String(l).toLocaleLowerCase("tr") === nameLc));
      const e = matched ?? byName;
      if (e) {
        const label = e.labels?.tr?.value ?? e.labels?.en?.value ?? brand;
        out.wikidata = {
          id: e.id,
          label,
          description: e.descriptions?.tr?.value ?? e.descriptions?.en?.value ?? "",
          url: `https://www.wikidata.org/wiki/${e.id}`,
          websiteMatch: !!matched,
          facts: {
            logo: !!e.claims?.P154,
            inception: !!e.claims?.P571,
            industry: !!(e.claims?.P452 || e.claims?.P31),
            hq: !!(e.claims?.P159 || e.claims?.P131),
            social: Object.entries(SOCIAL).filter(([p]) => e.claims?.[p]).map(([, n]) => n),
          },
          claims: Object.keys(e.claims ?? {}).length,
        };
        for (const lang of ["tr", "en"] as const) {
          const t = e.sitelinks?.[`${lang}wiki`]?.title;
          if (t) out.wikipedia.push({ lang, title: t, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`, fromWikidata: true });
        }
      }
    } catch {
      /* yoksay */
    }
  }

  // 2) Wikidata'da yoksa Wikipedia'da başlık eşleşmesi ara (zayıf sinyal).
  if (!out.wikipedia.length) {
    for (const lang of ["tr", "en"] as const) {
      try {
        const j = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(brand)}`, st);
        const hit = (j.query?.search ?? []).find((s: any) => String(s.title).toLocaleLowerCase("tr").includes(brand.toLocaleLowerCase("tr")));
        if (hit) out.wikipedia.push({ lang, title: hit.title, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(hit.title).replace(/ /g, "_"))}`, fromWikidata: false });
      } catch {
        /* yoksay */
      }
    }
  }

  if (st.ok === 0 && st.fail > 0) throw new Error("Wikipedia/Wikidata'ya şu an ulaşılamadı — biraz sonra tekrar dene.");

  // 3) Puan + öneriler
  const w = out.wikidata;
  let score = 0;
  if (w) {
    score += w.websiteMatch ? 35 : 15;
    score += Math.min(15, Math.round(w.claims / 2));
    score += (w.facts.logo ? 3 : 0) + (w.facts.inception ? 3 : 0) + (w.facts.industry ? 2 : 0) + (w.facts.hq ? 2 : 0) + Math.min(5, w.facts.social.length * 2);
  }
  const trWiki = out.wikipedia.find((p) => p.lang === "tr");
  const enWiki = out.wikipedia.find((p) => p.lang === "en");
  score += trWiki ? (trWiki.fromWikidata ? 20 : 8) : 0;
  score += enWiki ? (enWiki.fromWikidata ? 15 : 5) : 0;
  out.score = Math.min(100, score);

  if (!w) out.tips.push("Wikidata'da marka kaydı yok. Ücretsiz bir Wikidata öğesi oluşturup resmi site (P856), kuruluş tarihi (P571), sektör (P452), merkez (P159) ve sosyal hesapları ekleyin — AI motorları markayı bu bilgi grafından tanır.");
  else {
    if (!w.websiteMatch) out.tips.push(`Bulunan Wikidata kaydında resmi site (P856) olarak ${host} yazmıyor; doğru kayıtsa resmi siteyi ekleyin, değilse markanıza ait yeni bir kayıt açın.`);
    const miss = [!w.facts.logo && "logo (P154)", !w.facts.inception && "kuruluş tarihi (P571)", !w.facts.industry && "sektör (P452)", !w.facts.hq && "merkez (P159)"].filter(Boolean);
    if (miss.length) out.tips.push(`Wikidata kaydına eksik bilgileri ekleyin: ${miss.join(", ")}.`);
    if (w.facts.social.length < 2) out.tips.push("Wikidata'ya sosyal hesaplarınızı (Instagram P2003, LinkedIn P4264, X P2002) ekleyin; varlık eşleşmesini güçlendirir.");
  }
  if (!out.wikipedia.length) out.tips.push("Wikipedia sayfası yok. Wikipedia 'kayda değerlik' ister: önce bağımsız basında (haber siteleri, sektör yayınları) markanızdan bahsedilmesini sağlayın; sayfayı kendiniz yazmayın, çıkar çatışması kuralı vardır.");
  else if (out.wikipedia.every((p) => !p.fromWikidata)) out.tips.push("Wikipedia'da adınızı içeren bir sayfa var ama Wikidata kaydınıza bağlı değil; doğru sayfaysa Wikidata öğesine site bağlantısı ekleyin.");
  out.tips.push("Kendi sitenizde Organization schema'sına sameAs olarak Wikidata/Wikipedia ve sosyal hesap adreslerini ekleyin.");
  return out;
}
