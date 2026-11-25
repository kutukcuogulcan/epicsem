import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AI_BOTS } from "./ai-bots";
import { isBotAllowed, parseRobotsTxt } from "./robots";
import type { CheckOutcome, DomainReadiness, ReadinessCheck } from "./agent-readiness-types";

const CITATION_BOTS = AI_BOTS.filter((b) => b.role === "citation").map((b) => b.userAgent);

/**
 * AI ajan hazırlık seviyesi (0–5) — Peec AI'ın "agent readiness" merdiveni mantığında, AI KULLANMADAN:
 *  1 Erişilebilir  → robots.txt okunur, AI arama botları engelli değil, sayfa bota 200 döner
 *  2 Bulunabilir   → sitemap, gerçek 404, noindex yok, JavaScript'siz gezinme linkleri
 *  3 Okunabilir    → JavaScript'siz metin, geçerli yapısal veri, Organization şeması
 *  4 İşlem yapabilir → ajan protokolleri (MCP, A2A ajan kartı, API kataloğu, OAuth)
 *  5 Satın alabilir → ajan ticareti uç noktası
 * Bir seviyeye ulaşmak için o seviyenin ve alttakilerin tüm "gate" kontrolleri geçmeli.
 */

const UA = "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot) EpicsemReadiness/1.0";

function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip);
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function get(url: string, ms = 9000): Promise<{ status: number; text: string; type: string }> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/json,text/plain,*/*" }, redirect: "follow", signal: AbortSignal.timeout(ms) });
    const type = r.headers.get("content-type") ?? "";
    const text = /text|json|xml|html/.test(type) || !type ? (await r.text()).slice(0, 600_000) : "";
    return { status: r.status, text, type };
  } catch {
    return { status: 0, text: "", type: "" };
  }
}

const C = (level: ReadinessCheck["level"], tier: ReadinessCheck["tier"], id: string, title: string, ok: boolean | "warn" | "skip", detail: string, why: string, fix: string): ReadinessCheck => ({
  id,
  level,
  tier,
  title,
  outcome: (ok === true ? "pass" : ok === false ? "fail" : ok) as CheckOutcome,
  detail,
  why,
  fix,
});

export async function checkDomain(domain: string, brand: string, own: boolean): Promise<DomainReadiness> {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const base: DomainReadiness = { domain: host, brand, own, level: 0, next: null, checks: [], checkedAt: new Date().toISOString() };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { ...base, error: "Geçersiz alan adı" };
  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) return { ...base, error: "Bu adres kontrol edilemez" };
  } catch {
    return { ...base, error: "Alan adı bulunamadı" };
  }
  const origin = `https://${host}`;
  const [home, robots, llms, notFound, apiCat, mcp1, mcp2, a2a1, a2a2, oauth, ucp] = await Promise.all([
    get(`${origin}/`),
    get(`${origin}/robots.txt`, 7000),
    get(`${origin}/llms.txt`, 7000),
    get(`${origin}/epicsem-olmayan-sayfa-${Date.now().toString(36)}`, 7000),
    get(`${origin}/.well-known/api-catalog`, 6000),
    get(`${origin}/.well-known/mcp.json`, 6000),
    get(`${origin}/.well-known/mcp/server-card.json`, 6000),
    get(`${origin}/.well-known/agent-card.json`, 6000),
    get(`${origin}/.well-known/agent.json`, 6000),
    get(`${origin}/.well-known/oauth-authorization-server`, 6000),
    get(`${origin}/.well-known/ucp`, 6000),
  ]);
  const checks: ReadinessCheck[] = [];

  // ---- 1. Erişilebilir ----
  const robotsOk = robots.status >= 200 && robots.status < 300 && !/<html/i.test(robots.text);
  const blocks = robotsOk ? parseRobotsTxt(robots.text) : [];
  const allBlocked = robotsOk && !isBotAllowed(blocks, "*", "/") && !isBotAllowed(blocks, "Googlebot", "/");
  checks.push(C(1, "gate", "robots_txt", "robots.txt okunabiliyor", robotsOk ? !allBlocked : robots.status === 404 ? "warn" : false,
    robotsOk ? (allBlocked ? "robots.txt tüm siteyi engelliyor" : `${origin}/robots.txt bulundu`) : robots.status === 404 ? "robots.txt yok (engel de yok)" : `robots.txt açılamadı (HTTP ${robots.status || "zaman aşımı"})`,
    "AI ajanları siteye girmeden önce robots.txt'yi okur; açılmazsa ya da her şeyi engellerse çoğu ajan siteyi atlar.",
    "Sitenin kökünde erişilebilir bir robots.txt yayınla; tüm siteyi engelleyen `Disallow: /` kuralını kaldır."));
  const blockedBots = robotsOk ? CITATION_BOTS.filter((b) => !isBotAllowed(blocks, b, "/")) : [];
  const homeOk = home.status >= 200 && home.status < 300;
  checks.push(C(1, "gate", "ai_agent_access", "AI arama botları siteye girebiliyor", !blockedBots.length && homeOk,
    !homeOk ? `Ana sayfa bot isteğine HTTP ${home.status || "yanıt yok (zaman aşımı/engel)"} döndü` : blockedBots.length ? `Engelli: ${blockedBots.slice(0, 5).join(", ")}` : "OAI-SearchBot, PerplexityBot, ClaudeBot vb. izinli; ana sayfa 200 döndü",
    "Bu botlar engelliyse ya da güvenlik duvarı onları reddediyorsa site ChatGPT, Perplexity ve Claude cevaplarında kaynak gösterilemez.",
    blockedBots.length ? `robots.txt'de şu botlara izin ver: ${blockedBots.slice(0, 5).join(", ")} (User-agent: <bot> / Allow: /).` : "CDN/WAF (Cloudflare vb.) bot korumasında AI arama botlarını beyaz listeye al."));

  const $ = cheerio.load(home.text || "<html></html>");
  // ---- 2. Bulunabilir ----
  const smFromRobots = robotsOk ? robots.text.match(/^\s*sitemap:\s*(\S+)/im)?.[1] : undefined;
  const sm = await get(smFromRobots || `${origin}/sitemap.xml`, 8000);
  const smUrls = (sm.text.match(/<loc>/gi) ?? []).length;
  const lastmod = /<lastmod>/i.test(sm.text);
  checks.push(C(2, "gate", "sitemap", "Site haritası var", sm.status === 200 && smUrls > 0, sm.status === 200 && smUrls > 0 ? `${smUrls} adres${smFromRobots ? " · robots.txt'de bildirilmiş" : ""}` : "sitemap.xml bulunamadı ya da boş",
    "Ajanlar ve arama motorları sitedeki sayfaları site haritasından keşfeder.",
    "Bir XML site haritası yayınla ve robots.txt'ye `Sitemap: https://alanadi/sitemap.xml` satırı ekle."));
  const soft404 = notFound.status === 200;
  checks.push(C(2, "gate", "soft_404", "Olmayan sayfalar gerçek 404 döndürüyor", notFound.status === 0 ? "skip" : !soft404, soft404 ? "Olmayan bir adres 200 döndü (soft 404)" : `Olmayan adres HTTP ${notFound.status || "?"} döndü`,
    "Olmayan sayfa 200 dönerse ajanlar boş sayfaları gerçek içerik sanar, siteye güvenleri azalır.",
    "Olmayan adresler için sunucunun 404 durum kodu döndürmesini sağla."));
  const robotsMeta = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
  checks.push(C(2, "gate", "meta_robots", "Ana sayfa indekslenebilir (noindex yok)", homeOk ? !/noindex|none/.test(robotsMeta) : "skip", robotsMeta ? `meta robots: ${robotsMeta}` : "meta robots kısıtlaması yok",
    "noindex olan sayfalar arama motorlarında ve AI cevaplarında yer almaz.", "Ana sayfadaki `<meta name=\"robots\" content=\"noindex\">` etiketini kaldır."));
  const internalLinks = new Set(
    $("a[href]")
      .map((_, a) => $(a).attr("href") ?? "")
      .get()
      .filter((h) => h.startsWith("/") || h.includes(host))
  ).size;
  checks.push(C(2, "gate", "navigation_without_js", "JavaScript'siz gezinme linkleri var", homeOk ? internalLinks >= 5 : "skip", `Ham HTML'de ${internalLinks} iç link`,
    "Çoğu AI ajanı JavaScript çalıştırmaz; menü linkleri yalnızca JS ile oluşuyorsa diğer sayfaları bulamaz.", "Menü ve önemli linkleri sunucu tarafında HTML olarak üret (SSR/statik)."));
  checks.push(C(2, "reported", "sitemap_lastmod", "Site haritasında güncelleme tarihleri", sm.status === 200 && smUrls > 0 ? lastmod : "skip", lastmod ? "lastmod var" : "lastmod yok",
    "lastmod, ajanların değişen sayfaları önceliklendirmesini sağlar.", "Site haritasındaki her adrese gerçek `<lastmod>` tarihi ekle."));

  // ---- 3. Okunabilir ----
  $("script,style,noscript,svg").remove();
  const words = ($("main").text() || $("body").text()).replace(/\s+/g, " ").trim().split(" ").filter((w) => w.length > 1).length;
  checks.push(C(3, "gate", "render_without_js", "İçerik JavaScript'siz okunabiliyor", homeOk ? words >= 150 : "skip", `Ham HTML'de ~${words} kelime`,
    "AI tarayıcılarının çoğu sayfayı JS çalıştırmadan okur; içerik sonradan yükleniyorsa sayfayı boş görür.", "Ana içeriği sunucu tarafında render et (SSR/SSG); önemli metni JS'e bağlama."));
  const $raw = cheerio.load(home.text || "");
  const ld = $raw('script[type="application/ld+json"]').map((_, el) => $raw(el).text()).get();
  let valid = 0;
  const types = new Set<string>();
  for (const t of ld) {
    try {
      const j = JSON.parse(t);
      valid++;
      const walk = (x: any) => {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) return x.forEach(walk);
        const ty = x["@type"];
        (Array.isArray(ty) ? ty : [ty]).filter(Boolean).forEach((v: string) => types.add(String(v)));
        if (x["@graph"]) walk(x["@graph"]);
      };
      walk(j);
    } catch {
      /* bozuk blok */
    }
  }
  checks.push(C(3, "gate", "structured_data", "Geçerli yapısal veri (JSON-LD)", homeOk ? valid > 0 && valid === ld.length : "skip",
    ld.length ? `${valid}/${ld.length} blok geçerli${types.size ? ` · ${[...types].slice(0, 5).join(", ")}` : ""}` : "JSON-LD yok",
    "Yapısal veri, ajanların fiyat, adres, ürün ve kurum bilgisini güvenle çıkarmasını sağlar.", "Sayfa türüne uygun JSON-LD ekle; bozuk blokları validator.schema.org'da düzelt."));
  const orgTypes = ["Organization", "Corporation", "LocalBusiness", "BankOrCreditUnion", "FinancialService", "Store", "OnlineStore", "ProfessionalService", "NewsMediaOrganization"];
  const hasOrg = [...types].some((t) => orgTypes.includes(t) || /Organization|Business|Store/.test(t));
  checks.push(C(3, "gate", "organization_schema", "Organization şeması", homeOk ? hasOrg : "skip", hasOrg ? "Kurum bilgisi tanımlı" : "Organization/LocalBusiness şeması yok",
    "Ajanlar markanın kim olduğunu (ad, logo, iletişim, sosyal hesaplar) bu şemadan öğrenir; Peec bunu 3. seviyenin kapısı sayar.",
    "Ana sayfaya name, url, logo, sameAs (sosyal hesaplar) ve contactPoint içeren Organization JSON-LD ekle (Site Denetimi'ndeki hazır kodu kullanabilirsin)."));
  const meta = $('meta[name="description"]').attr("content")?.trim();
  checks.push(C(3, "reported", "meta_description", "Meta açıklama", homeOk ? !!meta : "skip", meta ? `${meta.length} karakter` : "yok", "Ajanlar sayfanın özetini önce buradan alır.", "140–160 karakterlik bir meta açıklama yaz."));
  checks.push(C(3, "reported", "llms_txt", "llms.txt", llms.status === 200 && !/<html/i.test(llms.text), llms.status === 200 && !/<html/i.test(llms.text) ? "Bulundu" : "Yok", "LLM'lere sitenin temiz bir haritasını verir.", "Marka özeti ve önemli sayfaların linkleriyle /llms.txt yayınla."));
  checks.push(C(3, "reported", "language", "Sayfa dili", homeOk ? !!$("html").attr("lang") : "skip", $("html").attr("lang") ? `lang="${$("html").attr("lang")}"` : "yok", "Doğru dil, içeriğin doğru kitleye gösterilmesini sağlar.", '<html lang="tr"> ekle.'));
  checks.push(C(3, "reported", "canonical", "Canonical", homeOk ? !!$('link[rel="canonical"]').attr("href") : "skip", $('link[rel="canonical"]').attr("href") ?? "yok", "Kopya içerik karışıklığını önler.", "Kendini gösteren bir canonical etiketi ekle."));
  checks.push(C(3, "reported", "open_graph", "Open Graph", homeOk ? !!$('meta[property="og:title"]').attr("content") : "skip", $('meta[property="og:title"]').attr("content") ? "og:title var" : "yok", "Paylaşım ve ajan önizlemeleri için başlık/görsel sağlar.", "og:title, og:description, og:image ekle."));

  // ---- 4. İşlem yapabilir ----
  const okJson = (r: { status: number; text: string }) => r.status === 200 && /^\s*[{[]/.test(r.text);
  checks.push(C(4, "gate", "mcp_server_card", "MCP sunucu kartı", okJson(mcp1) || okJson(mcp2), okJson(mcp1) || okJson(mcp2) ? "Bulundu" : "/.well-known/mcp.json yok",
    "MCP sunucusu, AI asistanlarının sitende arama/rezervasyon gibi işlemleri doğrudan yapmasını sağlar.", "Sitenin işlemlerini (ürün arama, randevu, sipariş durumu) bir MCP sunucusuyla aç ve /.well-known altında tanıt."));
  checks.push(C(4, "gate", "a2a_agent_card", "A2A ajan kartı", okJson(a2a1) || okJson(a2a2), okJson(a2a1) || okJson(a2a2) ? "Bulundu" : "/.well-known/agent-card.json yok",
    "Ajanlar arası (A2A) protokolde diğer ajanlar senin ajanını bu kartla bulur.", "Bir A2A ajan kartı yayınla (/.well-known/agent-card.json)."));
  checks.push(C(4, "gate", "api_catalog", "API kataloğu", okJson(apiCat) || (apiCat.status === 200 && /linkset/i.test(apiCat.text)), apiCat.status === 200 ? "Bulundu" : "/.well-known/api-catalog yok",
    "Ajanlar herkese açık API'lerini bu katalogdan keşfeder.", "Açık API'lerin varsa /.well-known/api-catalog (RFC 9727) yayınla."));
  checks.push(C(4, "gate", "oauth", "OAuth yetkilendirme sunucusu bilgisi", okJson(oauth), okJson(oauth) ? "Bulundu" : "yok",
    "Ajanların kullanıcı adına güvenle giriş yapabilmesi için gerekir.", "Kullanıcı hesabı gerektiren işlemler için OAuth metadata (RFC 8414) yayınla."));
  // ---- 5. Satın alabilir ----
  checks.push(C(5, "gate", "agentic_commerce", "Ajan ticareti uç noktası", okJson(ucp), okJson(ucp) ? "Bulundu" : "yok",
    "AI asistanlarının senin adına sepete ekleyip ödeme yapabilmesini sağlar (ChatGPT/Gemini alışveriş).", "E-ticaret sitesiysen ajan ticareti protokolünü (UCP/ACP) destekleyen ödeme altyapısını değerlendir."));

  // Seviye hesabı
  let level = 0;
  for (let l = 1; l <= 5; l++) {
    const gates = checks.filter((c) => c.level === l && c.tier === "gate" && c.outcome !== "skip");
    if (gates.every((g) => g.outcome === "pass" || g.outcome === "warn")) level = l;
    else break;
  }
  const nextGates = level < 5 ? checks.filter((c) => c.level === level + 1 && c.tier === "gate" && c.outcome === "fail").map((c) => c.id) : [];
  return { ...base, level, next: level < 5 ? { level: level + 1, blocking: nextGates } : null, checks, error: !homeOk && home.status === 0 ? "Ana sayfa yanıt vermedi" : undefined };
}
