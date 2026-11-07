#!/usr/bin/env node
/**
 * Veri akışı kontrolü — sol menüdeki her sayfanın beslendiği API'leri çağırır ve
 * (1) HTTP 200 dönüyor mu, (2) beklenen alanlar var mı, (3) aktif proje sitesi doğru
 * sayfalara gidiyor mu diye bakar. Ücretli/AI çağrısı yapan uçlara dokunmaz.
 *
 * Kullanım:
 *   BASE=http://localhost:3100 EMAIL=t@t.com PASSWORD=... node scripts/smoke-data.mjs
 *   PROJECT_ID=3 ile belirli bir projeyi kontrol et.
 *   (canlı için BASE=https://epicsem-web.onrender.com ve bir test hesabı)
 */
const BASE = process.env.BASE ?? "http://localhost:3100";
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
let cookie = "";

async function req(path, init = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { ...(init.headers ?? {}), cookie, "content-type": "application/json" }, redirect: "manual" });
  const set = r.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const kv = c.split(";")[0];
    const k = kv.split("=")[0];
    cookie = [...cookie.split("; ").filter((x) => x && !x.startsWith(k + "=")), kv].join("; ");
  }
  let body = null;
  try {
    body = await r.json();
  } catch {
    /* JSON değil */
  }
  return { status: r.status, body };
}

const results = [];
const has = (o, keys) => keys.filter((k) => !(o && k in o));
async function check(page, path, keys = [], extra, { okEmpty = false } = {}) {
  const t = Date.now();
  let r;
  try {
    r = await req(path);
  } catch (e) {
    results.push({ page, path, ok: false, note: `istek hatası: ${e.message}` });
    return null;
  }
  if (okEmpty && r.status === 404) {
    results.push({ page, path, ok: true, note: "veri yok (boş durum)", ms: Date.now() - t });
    return null;
  }
  const missing = r.status === 200 ? has(r.body, keys) : [];
  let note = r.status !== 200 ? `HTTP ${r.status}${r.body?.error ? ` — ${r.body.error}` : ""}` : missing.length ? `eksik alan: ${missing.join(", ")}` : "";
  if (!note && extra) note = extra(r.body) ?? "";
  results.push({ page, path, ok: !note, note, ms: Date.now() - t });
  return r.body;
}

(async () => {
  if (EMAIL && PASSWORD) {
    const l = await req("/api/auth/login", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
    if (l.status !== 200) {
      console.error("Giriş başarısız:", l.status, l.body);
      process.exit(2);
    }
  }
  // PROJECT_ID verilirse o proje seçilir; yoksa hesabın aktif/ilk projesi.
  if (process.env.PROJECT_ID) await req("/api/project", { method: "PUT", body: JSON.stringify({ id: Number(process.env.PROJECT_ID) }) });
  const proj = await check("Proje seçici", "/api/project", ["active", "projects", "suggestions"]);
  const d = proj?.active?.domain;
  if (!d) console.log("! Aktif proje yok — site gerektiren kontroller atlanacak. Sol menüden bir proje seç.");

  await check("Genel Bakış", "/api/overview", []);
  await check("Tüm Yazılar", "/api/content", ["drafts"]);
  await check("Autoblog", "/api/campaigns", ["campaigns"]);
  await check("Bilgi Bankası", "/api/knowledge", ["content"]);
  await check("Yayın Hedefleri", "/api/cms/connections", ["connections"]);
  await check("Beslemeler", "/api/feeds", ["feeds"]);
  await check("Sıralama Takibi", "/api/rankings", ["keywords"]);
  await check("Site Gezgini", "/api/import/runs", ["runs"]);
  await check("Site Optimizasyonu", "/api/audit/runs", ["runs"]);
  await check("Rakip Boşluğu", "/api/gap/runs", []);
  await check("Sayfa İzleme", "/api/monitor", ["pages"]);
  await check("Entegrasyonlar", "/api/integrations", []);
  await check("Müşteriler", "/api/clients", ["clients"]);
  await check("Marka Monitörleri", "/api/brand-monitors", ["monitors"]);
  await check("SEO Asistanı", "/api/assistant", ["sites"]);
  await check("Kullanım", "/api/usage", []);
  if (d) {
    const e = encodeURIComponent(d);
    await check("GEO Görünürlük", `/api/geo/latest?domain=${e}`, ["run"], (b) => (b.run && b.run.brand?.domain !== d ? `başka markanın verisi döndü: ${b.run.brand?.domain}` : null));
    await check("Backlinkler", `/api/backlinks?site=${e}`, ["sources"], (b) => (b.site && b.site !== d ? `yanlış site: ${b.site}` : null));
    await check("İşletme Kayıtları", `/api/citations?site=${e}`, []);
    await check("URL İndeksleme", `/api/indexnow?site=${e}`, ["ready"]);
    await check("Monitör detayı", `/api/brand-monitors/${e}`, ["prompts", "engines"], (b) => (b.brand?.domain !== d ? `yanlış marka: ${b.brand?.domain}` : null), { okEmpty: true });
    await check("İç linkler (Editör)", `/api/editor/links?domain=${e}`, ["pages"]);
  }

  const bad = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? (r.note ? "○" : "✓") : "✗"} ${r.page.padEnd(22)} ${r.path}${r.note ? `  → ${r.note}` : ""}${r.ms != null ? `  (${r.ms} ms)` : ""}`);
  console.log(`\n${results.length - bad.length}/${results.length} kontrol geçti.`);
  process.exit(bad.length ? 1 : 0);
})();
