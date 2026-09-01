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
- **Uçtan uca QA geçişi + üretim sertleştirme** (2026-08-27) — `/audit`, `/geo`,
  `/gap`, `/monitor`, `/clients` formlarındaki sessiz no-op validasyonlar gerçek
  hata mesajlarına çevrildi; her sayfa artık süresi dolmuş oturumda (401) otomatik
  `/login`'e yönlendiriyor; API route'larındaki ham Zod hata dump'ları
  (`lib/zod-error.ts`) okunabilir tek satırlık mesajlara çevrildi; `/api/audit`,
  `/api/geo`, `/api/gap`, `/api/monitor/check`, `/api/auth/login`,
  `/api/auth/signup` artık bellek-içi rate limiting ile korunuyor
  (`lib/rate-limit.ts` — kullanıcı/IP başına saatlik limit; login/signup brute-force
  koruması için IP başına). Tek instance için yeterli — yatay ölçeklenirse
  paylaşımlı bir store'a (Redis vb.) taşınması gerekir, bilinçli bir sınır.
- **Gerçek zamanlı scheduler artık canlıda** (2026-08-27) — Railway'de ayrı bir
  `epicsem-cron-v2` servisi `node scripts/check-monitors.mjs`'i 6 saatte bir
  (`0 */6 * * *`) çalıştırıyor; `/api/monitor/check`'in "sayfa yok" durumu artık
  hata değil boş sonuç döndürüyor (cron'un ilk günlerde, henüz kimse sayfa
  eklememişken sahte "failed" görünmesini engellemek için).
- **GEO motor listesi 4'ten 8'e çıktı + AXO trend grafiği + Claude Code prompt
  kütüphanesi** (2026-08-31) — Arvow'u (arvow.com) referans alıp hem güçlü yönlerini
  hem de kullanıcı yorumlarındaki gerçek şikayetlerini (ince içerik, zayıf yayın-sonrası
  izleme, kafa karıştırıcı fiyatlandırma) inceledikten sonra, zaten güçlü olduğumuz
  GEO/AXO tarafını derinleştirme yönünde ilerledik:
  - `/geo` ve `/gap`'e **DeepSeek** ve **Grok (xAI)** gerçek API entegrasyonu (OpenAI
    uyumlu REST API'ler, `DEEPSEEK_API_KEY`/`XAI_API_KEY` ile), artı **Meta AI** ve
    **Microsoft Copilot** — bu ikisinin herkese açık bir chat-completion API'si
    olmadığı için her zaman (açıkça etiketlenmiş) demo modunda çalışıyorlar, ama GEO
    dashboard'unda gerçek/sık atıf yapılan yüzeyler olarak yine de listeleniyorlar.
    `lib/geo-providers.ts`, `lib/geo-demo.ts`, `lib/geo-engine.ts`.
  - `/monitor`'a her sayfa için **SEO/AXO trend grafiği** ("Trend" butonu, recharts
    LineChart) — Arvow'un "yayın sonrası izleme çok zayıf" eleştirisine karşı bizim
    zaten var olan avantajımızı görünür kılıyor. `lib/db.ts`'e
    `getMonitorCheckHistory()` + yeni `/api/monitor/history` route'u.
  - Yeni **`/prompts`** sayfası (girişsiz, herkese açık) — Claude Code'u (veya dosya
    erişimi olan herhangi bir kodlama ajanını) doğrudan bir web sitesi kod tabanında
    SEO işi yaptırmak için özgün, kategorilere ayrılmış prompt kütüphanesi (teknik SEO,
    AXO crawler erişimi, schema üretimi, LLM citation reverse-engineering, gap
    analizinden içerik brief'i, dahili linkleme, programatik SEO, öncelikli içerik).
    `lib/prompt-library.ts`. Ayrıca `/audit` ve `/gap` sonuçlarına **"Fix with Claude
    Code"** butonu eklendi — o çalıştırmanın gerçek bulgularıyla (uydurma veri değil)
    doldurulmuş, kopyala-yapıştır'a hazır kişisel bir prompt üretiyor
    (`lib/claude-code-prompt.ts`, `components/PromptBlock.tsx`).
  - **2026-09-01** — Yeni **`/import`** sayfası: Screaming Frog CSV import (Export →
    Internal → All). Arvow dahil tek-URL araçların hiçbirinin yapmadığı toplu site
    taraması: eksik/yinelenen title & meta description, ince içerik (<200 kelime),
    kırık linkler (4xx/5xx), eksik/çoklu H1, noindex sayfaları — binlerce URL'de tek
    seferde tespit ediyor. Sütun isimleri versiyona göre esnek eşleniyor (sadece
    "Address" zorunlu), CSV parser bağımlılıksız yazıldı (`lib/screaming-frog-import.ts`).
    Bulgular `import_runs` tablosunda saklanıyor (geçmiş taramalar tekrar açılabilir),
    ve toplu bulguları özetleyen bir **"Fix with Claude Code"** prompt'u da üretiyor
    (`buildBulkImportFixPrompt`, `lib/claude-code-prompt.ts`).

## Bugün ne çalışmıyor / bilinçli olarak MVP dışı bırakıldı

- **Billing / plan limiti** — hesap sistemi var ama ödeme/abonelik/kullanım limiti
  yok. `DEMO_MODE`'u kapatıp gerçek API anahtarlarını bağlamadan önce mutlaka bir
  ödeme/limit katmanı eklenmeli, yoksa siteye gelen herkesin GEO testi sizin LLM
  faturanıza yazılır. Rate limiting kötüye kullanımı yavaşlatır ama bir plan/kota
  sistemi değildir.
- **Çok sayfalı toplu tarama** — `/audit` ve `/gap` hâlâ tek URL alıyor; `/import` ile
  Screaming Frog CSV'sinden toplu teknik bulgu çıkarılabiliyor ama bu bir crawler değil
  — yine de önce Screaming Frog ile taramanız gerekiyor. Epicsem'in kendi çoklu-sayfa
  crawler'ı yok (bilinçli: Screaming Frog zaten var ve daha iyi, tekerleği yeniden
  icat etmemek için onun export'unu okumayı seçtik).
- **Gerçek sentiment modeli** — şu an anahtar kelime sözlüğüne dayalı kaba bir skor;
  üretimde bunu bir LLM-hakem çağrısına (küçük, ucuz bir model) çevirmek gerekir.

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
   Railway'de aynı repodan **ikinci bir servis** oluşturup (asıl web servisiyle aynı
   proje/environment içinde) şöyle ayarlamak gerekiyor:
   - **Build command**: `npm install` (bu servis Next.js'i build etmiyor, sadece
     script'i çalıştırıyor — `npm run build`'u atlamak deploy'u hızlandırır).
   - **Start command**: `node scripts/check-monitors.mjs`
   - **Cron schedule**: örn. `0 */6 * * *` (6 saatte bir; Railway'in minimum aralığı
     5 dakika).
   - **Restart policy**: `NEVER` (bu bir kereye mahsus çalışıp çıkan bir script,
     sürekli servis değil — crash'te yeniden başlatılmasına gerek yok).
   - Variables: `APP_URL` = web servisinin genel URL'si (`https://...up.railway.app`),
     `CRON_SECRET` = 3. adımdaki ile **aynı** değer.
   - Bu proje (`epicsem`) içinde canlıda bu servis `epicsem-cron-v2` adıyla kurulu.

## Klasör yapısı

```
app/
  page.tsx                    → giriş sayfası (konumlandırma + rakip karşılaştırması)
  login/page.tsx               → giriş/kayıt formu (tek sayfa, mod değiştirme)
  audit/page.tsx               → SEO + AXO audit arayüzü (+ Fixes, + trend)
  geo/page.tsx                  → GEO/AEO görünürlük testi arayüzü (+ TR/EN prompt preset, + trend)
  gap/page.tsx                    → Gap Analysis arayüzü (+ içerik brief'leri, + PDF export)
  monitor/page.tsx                 → AXO izleme arayüzü (sayfa ekle/check now/alertler/trend grafiği)
  clients/page.tsx                  → müşteri kaydı + audit/GEO/gap'e hızlı geçiş
  prompts/page.tsx                   → Claude Code SEO prompt kütüphanesi (girişsiz, herkese açık)
  import/page.tsx                     → Screaming Frog CSV import arayüzü (özet kutuları, filtrelenebilir tablo, geçmiş taramalar)
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
  api/monitor/history/route.ts                → GET ?pageId= -> kronolojik SEO/AXO skor geçmişi (trend grafiği için, auth gerekli)
  api/import/screaming-frog/route.ts           → POST multipart/form-data{file} -> BulkImportResult; GET (liste) / GET ?id= (tek taramayı geri getir) (auth gerekli)
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
  rate-limit.ts                  → bellek-içi sliding-window rate limiter (login/signup IP, audit/geo/gap/monitor kullanıcı başına)
  zod-error.ts                   → ham ZodError dump'ını okunabilir "alan: mesaj" satırına çevirir
  geo-engine.ts                  → prompt'ları motorlara koşturan + skorlayan orkestratör
  geo-providers.ts               → 8 motor provider'ı (OpenAI/Anthropic/Google/Perplexity/DeepSeek/xAI gerçek API; Meta AI/Copilot her zaman demo — genel API'leri yok)
  geo-demo.ts                    → API key yokken (veya Meta AI/Copilot için her zaman) kullanılan gerçekçi demo üretici
  geo-analyze.ts                 → yanıt metninden mention/position/sentiment/citation çıkarımı
  prompt-library.ts              → /prompts sayfasındaki statik Claude Code prompt kütüphanesi (kategorilere ayrılmış)
  claude-code-prompt.ts          → gerçek audit/gap/bulk-import sonucundan kişisel "Fix with Claude Code" prompt'u üretir
  screaming-frog-import.ts       → bağımsızlık gerektirmeyen CSV parser + sütun eşleme + toplu SEO issue tespiti
middleware.ts                    → oturum çerezi yoksa korumalı sayfalardan /login'e yönlendirir (Edge, cheap check)
components/FixCard.tsx           → kopyala-butonlu fix kartı
components/LogoutButton.tsx      → Nav'daki çıkış butonu (client component)
components/PromptBlock.tsx       → aç/kapa + kopyala butonlu prompt kartı (/prompts, /audit, /gap'te kullanılıyor)
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
- [x] **Uçtan uca QA + rate limiting** (2026-08-27) — yapıldı, bkz. yukarıdaki
  "Bugün ne çalışıyor" bölümü.
- [x] **Gerçek zamanlı scheduler canlıda** (2026-08-27) — yapıldı, Railway'de
  `epicsem-cron-v2` servisi 6 saatte bir çalışıyor.
- [x] **GEO motor listesi 4 → 8** (2026-08-31) — DeepSeek + xAI gerçek API, Meta
  AI + Copilot demo-only. Peec AI'ın `list_model_channels`'ında görünen Amazon/
  Mistral/Qwen gibi daha küçük motorlar hâlâ eklenebilir ama şu an gerçek API'leri
  ya da anlamlı bir GEO payı yok — düşük öncelik.
- [x] **AXO trend grafiği** (`/monitor` → "Trend" butonu) (2026-08-31) — yapıldı.
- [x] **Claude Code SEO prompt kütüphanesi** (`/prompts` + `/audit` ve `/gap`'te
  "Fix with Claude Code") (2026-08-31) — yapıldı; arvow.com'u referans alıp hem
  güçlü yönlerinden ilham aldık hem de kullanıcı şikayetlerindeki (ince içerik,
  zayıf izleme) boşlukları bilinçli olarak farklı çözdük.
- [ ] **Billing / plan limiti** — SaaS olarak satmadan önceki asıl eksik. Stripe
  entegrasyonu + plan/kullanım limiti + `DEMO_MODE` kapatılmadan önce bir koruma
  katmanı gerekiyor.
- [x] **Screaming Frog CSV import** (`/import`) (2026-09-01) — yapıldı; toplu teknik
  SEO taraması (title/meta/H1/thin content/broken links/noindex), geçmiş taramalar
  `import_runs`'ta saklanıyor, özetten "Fix with Claude Code" prompt'u üretiyor.
- [ ] **Canlıya deploy güncellemesi bekliyor** — 27 Ağustos'taki QA/rate-limiting
  commit'i, 31 Ağustos'taki motor/trend/prompt commit'i ve şimdiki bulk-import
  commit'i GitHub'da ama Railway'deki `epicsem-web-v3` hâlâ eski kodu çalıştırıyor;
  iki ayrı Railway/GitHub izin sorunu kullanıcı onayı bekliyor (bkz. proje hafızası
  [[architecture]]).
1. **Arvow tarzı otomatik içerik üretimi + CMS yayını (autoblog)** — Arvow'un asıl
   çekirdek özelliği ve en büyük iş; bilinçli olarak ertelendi (bkz. proje hafızası).
   Yapılırsa Arvow'un "ince içerik" ve "şeffaf olmayan kredi sistemi" eleştirilerinden
   kaçınacak şekilde: gerçek audit/gap verisinden beslenen brief-first üretim ve net,
   kullanım bazlı fiyatlandırma.

## Kaynaklar

- [SerpApi](https://serpapi.com/)
- [GEO Tool](https://www.geo-tool.com/en)
- [Seobility GEO Tool](https://www.seobility.net/en/generative-engine-optimization-tool/)
- [Semust](https://semust.com/)
- [Peec AI](https://peec.ai/)
