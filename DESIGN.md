# Epicsem tasarım sistemi (Arvow tarzı açık tema)

Tüm araç sayfaları aynı dili kullanır. Yeni sayfa yazarken önce `components/ui` içindeki şablonlara bak.

## Renkler (tailwind.config.ts)
| Ad | Değer | Kullanım |
|---|---|---|
| `ink` | #0f172a | Ana metin |
| `panel` | #ffffff | Kart ve kutu zemini |
| `muted` | #f1f5f9 | İkincil zemin, tablo başlığı |
| `border` | #e2e8f0 | İnce çerçeveler |
| `accent` | #5d16ff | Mor vurgu: birincil buton, aktif sekme |
| `seo` | #10b981 | Durum: iyi |
| `warn` | #f59e0b | Durum: dikkat |
| `danger` | #ef4444 | Durum: kötü |

İkincil metin için `text-slate-500`. Sayfa zemini `#f8fafc`.

## Şablonlar (`components/ui`)
- `ToolPageHeader` (components/ToolPageHeader.tsx) — `title`, `description`, `badge` (ör. "YENİ", "BETA"), `actionButton`. Başlık `text-2xl font-bold`, açıklama `text-slate-500`, altında `border-b` ve `pb-6 mb-8`. `PageHeader` (components/ui) aynı görünümde, ek olarak `back` bağlantısı alır.
- `Card`, `CardHeader`, `StatCard` — `rounded-xl border bg-panel p-6 shadow-sm`. Global `.card` sınıfı da aynı.
- `StandardTable` — ince çizgili tablo; başlık `bg-muted text-xs uppercase text-slate-500`, satır `px-6 py-4`, hover `bg-muted/50`.
- `UnderlineTabs` — aktif sekme mor yazı + altında 2px mor çizgi; sayı rozeti destekli.
- `Drawer` — sağdan açılan panel; Esc ve arka plan tıklaması kapatır, sayfa kaydırmasını kilitler. Genişlik: md / lg / xl / 2xl. Form çekmecesi için `as="form" onSubmit`. Kendi gövde/footer düzeni olan çekmeceler `raw` + `header` + `panelClassName` ile kullanır. Uygulamadaki tüm sağ çekmeceler bu bileşeni kullanır.
- Puan halkası ve duygu çubuğu: `components/tool/MonitorBits.tsx`.

## Kurallar
- Sayfa başlığı `font-bold`; kart ve bölüm başlıkları `font-semibold`; `font-extrabold` kullanma.
- Gölge yalnızca `shadow-sm` (çekmece hariç).
- Ayar ve detaylar sayfayı uzatmak yerine `Drawer` içinde açılır.
- Mor yalnızca vurgu içindir; büyük alanları mora boyama.

## Veri akışı: aktif proje
- Sol menünün altındaki **Proje** seçicisi (`components/ProjectSwitcher.tsx`) hangi site/marka için çalışıldığını belirler. Proje = Müşteriler tablosundaki kayıt (ad, site, rakipler); seçim tarayıcı çerezinde (`epicsem_project`) tutulur. API: `/api/project` (GET/PUT/POST/PATCH).
- Sayfalar siteyi kendileri tahmin etmez: `const { project } = useProject()` (`components/ProjectProvider.tsx`) ve `project.domain` değişince veriyi yeniden yükler.
- Sunucu bileşenleri (Genel Bakış) çerezi okur; proje değişince `router.refresh()` ile yeniden çizilir.
- Projeye ait veri yoksa başka markanın verisine düşülmez; boş durum gösterilir.
