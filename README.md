# Epicsem — SEO + GEO/AEO/AXO görünürlük aracı

Tek dashboard'da iki şeyi ölçüyoruz: klasik arama motoru SEO'su ve yapay zeka
motorlarındaki (ChatGPT, Claude, Gemini, Perplexity) görünürlük. "GEO" (Generative
Engine Optimization) her zaman SEO'nun üstüne oturur — bir sayfa önce teknik olarak
sağlam ve AI botlarına açık olmalı (AXO), sonra "cevap-öncelikli" yazılmalı (AEO),
ancak o zaman AI motorları onu alıntılayabilir (GEO görünürlüğü).

## Rakip analizi (Ağustos 2026) — nereye konumlanıyoruz

| Araç | Güçlü yanı | Boşluk |
|---|---|---|
| **Peec AI** | Temiz görünürlük/sentiment/share-of-voice takibi, çok modelli | "Ne olduğunu söylüyor ama nasıl düzeltileceğini değil" — altında teknik SEO/crawlability katmanı yok |
| **Seobility** | Var olan güçlü bir SEO paketine GEO eklenmiş | ChatGPT/Gemini takibi hâlâ "yakında"; GEO ayrı bir modül gibi duruyor |
| **SerpApi** | 100+ SERP/AI Overview API'si, güçlü altyapı | Bitmiş bir dashboard değil — geliştirici altyapısı, pazarlamacı için değil |
| **geo-tool.com** | Ücretsiz, hızlı (47sn) GEO skoru, iyi kategorizasyon (Structure/Content/Schema/Citations/Multimedia/Platforms) | Tek seferlik audit; sürekli takip / rakip karşılaştırma yok |
| **Semust** | SEO + Ads tek dashboard'da, AI Overview takibi var | GEO/AEO görünürlüğü (ChatGPT, Claude, Perplexity) yok — sadece Google AI Overview |

**Farklılaşma noktamız:** hiçbiri "teknik SEO + AI-crawler erişilebilirliği (AXO) +
cevap-öncelikli içerik denetimi (AEO) + gerçek prompt bazlı çoklu-motor görünürlük
takibi (GEO)" dördünü aynı üründe, aynı skorlama mantığıyla birleştirmiyor. Bu repo
o dördünü tek bir Next.js uygulamasında MVP olarak kuruyor. Üstüne, hiçbir rakip
şunları yapmıyor — hepsi bu repoda çalışır durumda:

1. **Fix üretimi** — audit'te eksik bulunan meta description / Organization schema /
   FAQPage schema için, sayfanın **kendi içeriğinden** taslak kod üretiyor (uydurma
   içerik değil — bkz. `/audit` sayfasındaki "Fixes" bölümü). Peec AI dahil hiçbiri
   "ne eksik" ile "onu nasıl düzeltirim" arasındaki boşluğu kapatmıyor.
2. **Gap matrix** — `/gap` sayfası, aynı sayfa için SEO/AXO audit sonucunu GEO alıntı
   verisiyle çapraz eşliyor: teknik olarak sağlam ama hiç alıntılanmayan sayfaları
   ("strong but invisible"), AI botlarına kapalı olduğu için kaybedilen sayfaları
   ("blocked") ayrı ayrı işaretliyor. Hiçbir rakip audit verisiyle citation verisini
   sayfa bazında birleştirmiyor.
3. **İçerik brief'leri** — `/gap` sonucunda, kaybedilen prompt'lar (marka geçmiyor ya
   da rakip alıntılanmış) somut başlık/FAQ önerilerine dönüşüyor; audit'in bulduğu
   içerik boşluklarıyla (FAQ schema yok, içerik ince, meta yok) birleşiyor. Teşhisten
   "ne yazmalıyım"a kadar giden tek adım.
4. **Sürekli AXO izleme + alert** — `/monitor` sayfası, takip edilen sayfaları
   yeniden tarayıp önceki taramayla kıyaslıyor; daha önce izinli olan bir AI botu
   (GPTBot, ClaudeBot…) `robots.txt`'te yeni engellenmişse anında alert (+ opsiyonel
   Slack webhook) üretiyor — WAF/CDN güncellemesiyle sessizce olan bir kesintiyi
   haftalar sonra görünürlük düşüşünden anlamak yerine.
5. **Çoklu müşteri + white-label PDF rapor** — `/clients` sayfasında her müşterinin
   marka/rakip setini bir kez kaydedip audit/GEO/gap formlarını otomatik dolduruyor;
   herhangi bir sonuçtan Epicsem markalı, müşteriye gönderilebilir bir PDF rapor
   indiriyorsunuz (`lib/pdf-report.ts`).
6. **Türkiye pazarına özel derinlik** — `/geo` ve `/gap`'te hazır Türkçe örnek prompt
   seti; audit artık `<html lang>`/hreflang eksikliğini de kontrol ediyor ve
   `lang="tr"` tespit edildiğinde üretilen Organization şemasına otomatik
   `"areaServed": "TR"` ekliyor.
7. **Kapasız motor erişimi** — Peec AI'nin self-serve planları izlenen motoru 3 ile
   sınırlıyor, ekstra motor için ayrı ücret alıyor; burada OpenAI/Anthropic/Google/
   Perplexity baştan itibaren eşit ve kapasız.

## Bugün ne çalışıyor (gerçek, mock değil)

- **`/audit`** — bir URL'yi gerçekten fetch eder, title/meta/H1/schema.org JSON-LD/
  canonical'ı parse eder, `robots.txt`'i **user-agent bazında** parse edip GPTBot,
  ClaudeBot, PerplexityBot, Google-Extended, Googlebot, meta-externalagent, CCBot gibi
  12 AI/arama botunun sayfaya erişip erişemediğini tek tek gösterir, `sitemap.xml`
  kontrolü yapar ve 0-100 arası bir "Teknik SEO" ile bir "AXO (AI erişilebilirlik)"
  skoru üretir. Bu mantık `lib/seo-audit.ts`, `lib/robots.ts`, `lib/ai-bots.ts` içinde —
  yerel bir mock sayfa ve robots.txt ile uçtan uca test edildi (GPTBot'u engelleyen
  bir robots.txt'i doğru şekilde tespit etti, diğer botları doğru şekilde "izinli"
  işaretledi).
- **`/geo`** — kendi markanız + rakipleriniz + prompt listesi girip ChatGPT, Claude,
  Gemini, Perplexity'ye aynı anda soru sorduruyor; her yanıtta marka geçiyor mu,
  kaçıncı sırada geçiyor, hangi kaynaklar (URL) alıntılanmış, kaba bir sentiment skoru
  hesaplıyor; sonra visibility / share-of-voice / ortalama pozisyon / ortalama
  sentiment / alıntı sayısı olarak `Peec AI`'daki metriklerin birebir aynısını
  üretiyor (`lib/geo-engine.ts`, `lib/geo-analyze.ts`).
- **DEMO_MODE** — hiç API key yoksa (varsayılan durum) gerçek LLM çağrısı yapmak
  yerine gerçekçi ama açıkça "[DEMO DATA]" etiketli simüle yanıtlar üretiyor, böylece
  ürün key eklemeden de baştan sona denenebiliyor. Key eklendiğinde otomatik olarak
  gerçek API'lere geçiyor (`lib/geo-providers.ts`).
- **`/audit` → Fixes** — eksik bulunan meta description, Organization JSON-LD ve
  FAQPage JSON-LD için sayfanın kendi paragraflarından/başlıklarından taslak kod
  üretiyor; hiçbir şey uydurmuyor — üretecek gerçek malzeme yoksa (örn. soru şeklinde
  başlık yok) o fix'i hiç göstermiyor (`lib/fix-generator.ts`).
- **`/gap`** — bir marka + rakip(ler) + prompt listesi + denetlenecek sayfa URL'leri
  alıp, her sayfa için SEO/AXO audit'ini GEO alıntı verisiyle birleştiriyor ve
  "cited / blocked / strong but invisible / needs-work" olarak sınıflandırıyor
  (`lib/gap-analysis.ts`, `app/api/gap/route.ts`), altında da içerik brief'lerini
  üretiyor (`lib/content-brief.ts`).
- **Kalıcılık (node:sqlite)** — her audit/GEO/gap koşusu `data/epicsem.db`'ye
  yazılıyor (Node 22+'nin yerleşik `node:sqlite` modülüyle — native binary indirme
  gerekmiyor, Prisma'nın engine fetch sorununu tamamen atlıyor). `/audit` ve `/geo`
  aynı URL/marka için ikinci koşuda "önceki koşuya göre" trend farkını gösteriyor
  (`lib/db.ts`).
- **`/monitor`** — takip edilen sayfaları yeniden tarayıp önceki `robots.txt`
  taramasıyla kıyaslıyor, yeni engellenen bir AI botu varsa alert oluşturuyor (+
  opsiyonel Slack webhook). `scripts/check-monitors.mjs` ile bir OS cron/Vercel
  Cron'dan tetiklenebiliyor (`lib/monitor.ts`).
- **`/clients`** — müşteri/marka/rakip setini kaydedip audit, GEO, gap formlarına
  `?clientId=` ile otomatik dolduruyor; her sonuçtan Epicsem markalı PDF rapor
  indirilebiliyor (`lib/pdf-report.ts`, `app/api/report/pdf/route.ts`).
- **Türkçe pazar desteği** — `/geo` ve `/gap`'te TR örnek prompt seti; audit
  `<html lang>`/hreflang eksikliğini kontrol ediyor, `lang="tr"` tespit edilince
  üretilen Organization şemasına `"areaServed": "TR"` ekliyor.
- **Hesap sistemi + çoklu kullanıcı izolasyonu** (2026-08-27) — e-posta/şifre ile
  kayıt/giriş (`lib/auth.ts`, node:crypto `scrypt` ile hash'leme, DB'de session
  token, httpOnly cookie — NextAuth değil, tek credentials provider için yeterince
  küçük bir katman). Her audit/GEO/gap/monitor/client kaydı `user_id` ile ayrılıyor;
  iki farklı hesap birbirinin verisini göremiyor (uçtan uca test edildi — bkz.
  [[architecture]] proje hafızası). `middleware.ts` oturum çerezi yoksa `/audit`,
  `/geo`, `/gap`, `/monitor`, `/clients`'a girişi `/login`'e yönlendiriyor; asıl
  güvenlik sınırı her API route'unun başındaki `requireUser()` kontrolü.
  `scripts/check-monitors.mjs` artık bir `CRON_SECRET` header'ıyla kimlik doğruluyor
  (tek kullanıcıya değil, tüm hesapların sayfalarına bakması gerektiği için).

## Bugün ne çalışmıyor / bilinçli olarak MVP dışı bırakıldı

- **Billing / plan limiti** — hesap sistemi var ama ödeme/abonelik/kullanım limiti
  yok. `DEMO_MODE`'u kapatıp gerçek API anahtarlarını bağlamadan önce mutlaka bir
  ödeme/limit katmanı eklenmeli, yoksa siteye gelen herkesin GEO testi sizin LLM
  faturanıza yazılır.
- **Çok sayfalı toplu tarama** — şu an tek URL denetliyor (gap analysis birden fazla
  URL alıyor ama tek tek girilmesi gerekiyor). Screaming Frog export'u (CSV) import
  edip toplu tarama roadmap'te.
- **Gerçek sentiment modeli** — şu an anahtar kelime sözlüğüne dayalı kaba bir skor;
  üretimde bunu bir LLM-hakem çağrısına (küçük, ucuz bir model) çevirmek gerekir.
- **Gerçek zamanlı scheduler** — `/monitor`'un "yeniden tara" mantığı hazır ama
  kendi kendine periyodik çalışmıyor; `scripts/check-monitors.mjs`'i harici bir
  cron'a (OS crontab, Vercel Cron, GitHub Actions) bağlamanız gerekiyor — bkz. o
  dosyanın başındaki örnek.

## Kurulum

```bash
npm install
cp .env.example .env
# .env içine OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_AI_API_KEY / PERPLEXITY_API_KEY
# eklerseniz DEMO_MODE otomatik kapanır ve gerçek modellere sorulur.
# SLACK_WEBHOOK_URL eklerseniz AXO monitoring alertleri Slack'e de düşer (opsiyonel).

npm run dev            # http://localhost:3000 — data/epicsem.db ilk istekte otomatik oluşur
```

Node **22.5+** gerekir (kalıcılık katmanı `node:sqlite`'a dayanıyor — bkz. `engines`
alanı `package.json`'da). `prisma/schema.prisma` hâlâ veri modelinin referans
dokümantasyonu olarak duruyor ama `db:generate`/`db:push` artık gerekli değil.

## Deploy (Railway)

Kalıcılık katmanı dosya tabanlı SQLite (`data/epicsem.db`, `process.cwd()/data`) olduğu
için **sunucusuz (serverless) platformlar** (Vercel gibi) her deploy'da diski sıfırlar —
geçmiş/trend verisi kaybolur. Railway kalıcı disk (volume) sunduğu için kod hiç
değişmeden çalışır:

1. Railway'de yeni proje → bu repo'dan (veya zip'ten) deploy et. Build/start komutları
   Nixpacks tarafından `package.json`'dan otomatik algılanır (`npm run build`,
   `npm run start`); `next start` Railway'in verdiği `PORT` değişkenini otomatik kullanır.
2. **Volume ekle**: proje ayarlarından bir persistent volume oluşturup **`/app/data`**
   yoluna mount et (Railway'de kod `/app` altına deploy edilir, `lib/db.ts` de
   `process.cwd()/data` yani `/app/data`'yı kullanıyor — yol eşleşmezse veritabanı her
   deploy'da sıfırlanır).
3. Environment variables: `.env.example`'daki değişkenleri kopyala (API anahtarları
   opsiyonel — boş bırakılırsa `DEMO_MODE` açık kalır; `SLACK_WEBHOOK_URL` AXO
   uyarıları için opsiyonel; `CRON_SECRET` sadece adım 4'teki cron job'ı kullanacaksanız
   gerekli — uzun rastgele bir string üretip buraya girin).
4. `/monitor`'ün arkasındaki `scripts/check-monitors.mjs` kendi kendine tetiklenmiyor —
   Railway'de ayrı bir **Cron Job** servisi olarak (örn. saatte bir)
   `node scripts/check-monitors.mjs` komutunu, `APP_URL`'i deploy edilen uygulamanın
   kendi URL'sine ve `CRON_SECRET`'ı 3. adımdaki ile aynı değere ayarlayarak eklemek
   gerekir.

## Klasör yapısı

```
app/
  page.tsx                    → giriş sayfası (konumlandırma + rakip karşılaştırması)
  login/page.tsx               → giriş/kayıt formu (tek sayfa, mod değiştirme)
  audit/page.tsx               → SEO + AXO audit arayüzü (+ Fixes, + trend)
  geo/page.tsx                  → GEO/AEO görünürlük testi arayüzü (+ TR/EN prompt preset, + trend)
  gap/page.tsx                    → Gap Analysis arayüzü (+ içerik brief'leri, + PDF export)
  monitor/page.tsx                 → AXO izleme arayüzü (sayfa ekle/check now/alertler)
  clients/page.tsx                  → müşteri kaydı + audit/GEO/gap'e hızlı geçiş
  api/auth/signup/route.ts          → POST { email, password, name? } -> user + session cookie
  api/auth/login/route.ts            → POST { email, password } -> user + session cookie
  api/auth/logout/route.ts            → POST -> session'ı siler, cookie'yi temizler
  api/auth/me/route.ts                 → GET -> mevcut kullanıcı ya da 401
  api/audit/route.ts                → POST { url } -> SeoAuditResult + previousRun (auth gerekli)
  api/geo/route.ts                    → POST { brand, competitors, prompts, engines } -> runs+summaries+previousRun (auth gerekli)
  api/gap/route.ts                     → POST {...} -> gapMatrix + contentBriefs (auth gerekli)
  api/monitor/route.ts                  → GET/POST/DELETE monitored pages (auth gerekli, kullanıcıya özel)
  api/monitor/check/route.ts             → POST { pageId | all } -> re-audit + diff + alert (kullanıcı oturumu veya CRON_SECRET)
  api/monitor/alerts/route.ts             → GET/POST alert list + acknowledge (auth gerekli)
  api/clients/route.ts                     → GET/POST/DELETE clients (auth gerekli)
  api/clients/[id]/route.ts                 → GET tek client (prefill için, auth gerekli)
  api/report/pdf/route.ts                    → POST {...} -> application/pdf (white-label rapor, auth gerekli)
lib/
  auth.ts                        → e-posta/şifre + session (scrypt hash, DB'de token, httpOnly cookie)
  auth-cookie-name.ts            → sadece cookie adı — middleware.ts'in node:sqlite'ı import etmemesi için ayrı dosya
  seo-audit.ts                   → asıl SEO+AXO motoru (+ localization check)
  robots.ts                      → robots.txt parser (user-agent bazlı)
  ai-bots.ts                     → takip edilen 12 AI/arama botu listesi
  fix-generator.ts               → eksik meta/schema için sayfa içeriğinden taslak kod üretimi
  gap-analysis.ts                → audit + GEO citation verisini sayfa bazında birleştirip verdict üretimi
  content-brief.ts               → kaybedilen prompt'ları + audit boşluklarını brief'e çevirir
  monitor.ts                     → AXO yeniden-tarama + diff + Slack alert mantığı
  pdf-report.ts                  → pdfkit ile Epicsem markalı PDF rapor üretimi
  db.ts                          → node:sqlite kalıcılık katmanı — her tablo user_id ile ayrılmış (çoklu kiracı)
  geo-engine.ts                  → prompt'ları motorlara koşturan + skorlayan orkestratör
  geo-providers.ts               → OpenAI/Anthropic/Google/Perplexity provider'ları (pluggable)
  geo-demo.ts                    → API key yokken kullanılan gerçekçi demo üretici
  geo-analyze.ts                 → yanıt metninden mention/position/sentiment/citation çıkarımı
middleware.ts                    → oturum çerezi yoksa korumalı sayfalardan /login'e yönlendirir (Edge, cheap check)
components/FixCard.tsx           → kopyala-butonlu fix kartı
components/LogoutButton.tsx      → Nav'daki çıkış butonu (client component)
scripts/check-monitors.mjs       → /api/monitor/check'i CRON_SECRET ile tetikleyen bağımsız cron script'i
prisma/schema.prisma             → veri modelinin referans dokümantasyonu (artık node:sqlite kullanılıyor)
types/index.ts                   → paylaşılan TypeScript tipleri
```

## Sıradaki adımlar (öneri sırası)

- [x] **Fix üretimi** (`/audit` → Fixes bölümü) — yapıldı.
- [x] **Gap matrix** (`/gap` sayfası) — yapıldı.
- [x] **Kalıcılık + trend** (node:sqlite, `/audit` ve `/geo`'da "önceki koşuya göre") — yapıldı.
- [x] **Sürekli AXO izleme + Slack alert** (`/monitor`) — yapıldı.
- [x] **Türkiye pazarına özel derinlik** (TR prompt preset, hreflang/lang check, TR schema hint) — yapıldı.
- [x] **Çoklu müşteri + white-label PDF rapor** (`/clients`, `/api/report/pdf`) — yapıldı.
- [x] **Kapasız motor erişimi** — pozisyon zaten koddaydı, artık home sayfasında da mesajlaşıyor.
- [x] **İçerik brief üretimi** (`/gap` → Content briefs) — yapıldı.
- [x] **Hesap sistemi + çoklu kullanıcı izolasyonu** (2026-08-27) — yapıldı, SaaS'a
  dönüşümün ilk ve en kritik adımıydı.
- [ ] **Billing / plan limiti** — SaaS olarak satmadan önceki asıl eksik. Stripe
  entegrasyonu + plan/kullanım limiti + `DEMO_MODE` kapatılmadan önce bir koruma
  katmanı gerekiyor.
1. **Peec AI verilerini gerçek referans olarak kullan** — Peec AI zaten bağlı;
   `list_model_channels` 21 farklı AI motor kanalı (OpenAI, Google, Anthropic,
   Perplexity, DeepSeek, Meta, xAI, Microsoft, Amazon, Mistral, Qwen) döndürüyor.
   Bizim `geo-providers.ts`'teki 4 motoru bu listeye göre genişletmek gerçekçi bir
   sonraki adım.
2. **Screaming Frog CSV import** → zaten kullandığınız bir araç; toplu site taramasını
   sıfırdan yazmak yerine oradan import etmek daha hızlı bir yol.
3. **Gerçek zamanlı scheduler** → `scripts/check-monitors.mjs`'i bir hosting
   platformunun (Vercel Cron, GitHub Actions) zamanlayıcısına bağlamak — kod hazır,
   sadece bağlanması gerekiyor.

## Kaynaklar

- [SerpApi](https://serpapi.com/)
- [GEO Tool](https://www.geo-tool.com/en)
- [Seobility GEO Tool](https://www.seobility.net/en/generative-engine-optimization-tool/)
- [Semust](https://semust.com/)
- [Peec AI](https://peec.ai/)
