# Epicsem — Geliştirici Devir Notu

Bu proje, SEO + GEO/AEO/AXO görünürlük aracı "Epicsem". Aşağıdakiler, projeye yeni katılan bir geliştiricinin ihtiyaç duyacağı her şey.

## 1. Erişim

- **GitHub repo:** https://github.com/kutukcuogulcan/epicsem
  Repo private ise, GitHub'da Settings → Collaborators and teams üzerinden arkadaşını davet etmen gerekiyor (GitHub kullanıcı adını/e-postasını bilmen yeterli).
- **Canlı site:** https://epicsem-web.onrender.com
- **Hosting:** Render.com, servis adı `epicsem-web`, Frankfurt bölgesi, ücretsiz plan. Render'a erişim için kendi Render hesabından "Invite" ile ekleyebilirsin (Dashboard → workspace ayarları → Members).
- **Deploy akışı:** `main` branch'e push otomatik deploy tetikliyor (autoDeploy açık). Build komutu `npm install && npm run build`, start komutu `npm start`.

## 2. Yerel kurulum

```bash
git clone https://github.com/kutukcuogulcan/epicsem.git
cd epicsem
npm install
cp .env.example .env.local   # aşağıdaki değişkenleri doldur
npm run dev                  # http://localhost:3000
```

Node.js ≥ 22.5.0 gerekiyor (package.json → engines).

### Veritabanı

Uygulama Postgres kullanıyor (`lib/db.ts`, `pg` paketiyle). Yerelde çalıştırmak için bir Postgres instance'ı gerekiyor:

```bash
# örnek: yerel Postgres'te boş bir DB oluştur
createdb epicsem_dev
```

Sonra `.env.local`'da:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/epicsem_dev"
```

Şema migration'ları elle çalıştırmana gerek yok — `lib/db.ts`'teki `ensureSchema()` uygulama her açıldığında ihtiyaç duyulan tabloları otomatik oluşturuyor (`CREATE TABLE IF NOT EXISTS`).

## 3. Ortam değişkenleri (.env.example zaten repoda var)

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `DATABASE_URL` | Evet | Postgres bağlantı string'i |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `PERPLEXITY_API_KEY`, `DEEPSEEK_API_KEY`, `XAI_API_KEY` | Hayır | GEO/AEO motor testleri ve Content Studio üretimi için. Boş bırakılırsa `DEMO_MODE` devreye girer (gerçekçi ama açıkça etiketli simüle sonuçlar) |
| `DEMO_MODE` | Hayır (varsayılan: key yoksa otomatik true) | Yukarıdaki key'ler olmadan da ürünü baştan sona denemeyi sağlıyor |
| `SLACK_WEBHOOK_URL` | Hayır | AXO izleme uyarıları için varsayılan Slack webhook |
| `CRON_SECRET` | Cron script'i kullanacaksan evet | `scripts/check-monitors.mjs`'in `/api/monitor/check`'i tüm kullanıcılar için taraması için gereken paylaşılan secret |
| `DEMO_OPEN_ACCESS` | Hayır | `true` yapılırsa login olmadan tüm korumalı sayfalara (demo hesap üzerinden) erişim açılıyor — sadece pre-launch test için |
| `NEXT_PUBLIC_SITE_URL` | Hayır | Custom domain bağlanınca ayarlanacak; yoksa `https://epicsem-web.onrender.com`'a düşüyor |

**Gerçek API key değerlerini bu dosyaya koymadım** — onları ayrı ve güvenli bir kanaldan (örn. şifreli mesaj, password manager paylaşımı) ilet, e-posta/WhatsApp'a düz metin yapıştırma.

## 4. Mimari özeti

Next.js 15 (App Router) + TypeScript + Tailwind, tek repo. Sayfalar `app/`, iş mantığı `lib/`, paylaşılan bileşenler `components/`.

Ana araçlar: `/audit` (SEO+AXO denetimi), `/geo` (AI motor görünürlük testi), `/gap` (audit+GEO çapraz analiz), `/content` (Content Studio — AI taslak üretimi), `/monitor` (sürekli AXO izleme), `/campaigns` (otomatik içerik kampanyaları), `/clients`, `/import`, `/local`, `/article-writer`.

Projenin tam rakip analizi, farklılaşma noktaları ve "bugün gerçekten çalışan ne var" listesi için **README.md**'ye bak — çok detaylı, tekrar yazmadım.

## 5. Önemli bir tasarım kuralı (lütfen bunu koru)

Bu projede **hiçbir zaman mock/uydurma veri canlıya çıkmaz.** API key yokken bile "demo mode" açıkça etiketlenir (`[DEMO DATA]`, `demo mode` rozeti vb.) — gerçek bir kullanıcı hiçbir zaman sahte bir sayıyı gerçek sanamaz. Yeni bir özellik eklerken bu kuralı bozma: gerçek veri yoksa ya `[NEEDS: ...]` placeholder'ı kullan (bkz. `lib/content-generator.ts`) ya da özelliği "Yakında" olarak işaretleyip gerçek veri gelene kadar bekle.

## 6. Son yapılan işler (bağlam için)

- `/content` sayfasına gerçek, DB'ye bağlı bir "Content Hub" eklendi (hızlı aksiyon kartları + Inputs/Generations/Publications sekmeleri).
- `/geo` sayfasına Görünürlük/Duygu/Promptlar/Kaynaklar sekmeleri ve gerçek geçmiş veriye dayanan bir "Duygu trendi" grafiği eklendi.
- Sol tarafta bir sidebar navigasyonu (Panel/Analiz & Test/Otomasyon/Yönetim grupları) eklendi — `components/Sidebar.tsx`, `components/SidebarClient.tsx`, `lib/nav-groups.ts`.
