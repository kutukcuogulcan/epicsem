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
- `PageHeader` — başlık (text-2xl semibold) + açıklama + sağda eylemler. Araç sayfalarında `ToolPageHeader` da aynı ölçüleri kullanır.
- `Card`, `CardHeader`, `StatCard` — `rounded-xl border bg-panel p-6 shadow-sm`. Global `.card` sınıfı da aynı.
- `StandardTable` — ince çizgili tablo; başlık `bg-muted text-xs uppercase text-slate-500`, satır `px-6 py-4`, hover `bg-muted/50`.
- `UnderlineTabs` — aktif sekme mor yazı + altında 2px mor çizgi; sayı rozeti destekli.
- `Drawer` — sağdan açılan panel; Esc ve arka plan tıklaması kapatır (md / lg / xl genişlik).
- Puan halkası ve duygu çubuğu: `components/tool/MonitorBits.tsx`.

## Kurallar
- Başlıklar `font-semibold`, `font-extrabold` kullanma.
- Gölge yalnızca `shadow-sm` (çekmece hariç).
- Ayar ve detaylar sayfayı uzatmak yerine `Drawer` içinde açılır.
- Mor yalnızca vurgu içindir; büyük alanları mora boyama.
