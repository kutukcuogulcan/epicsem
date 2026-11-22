/**
 * Peec'in "agent readiness" ve taranabilirlik önerilerinden üç ücretsiz kontrolün karar kısmı (saf):
 * site haritası lastmod tarihleri gerçek mi, robots.txt'de AI içerik kullanım tercihi (Content-Signal) var mı,
 * olmayan bir sayfa gerçekten 404 dönüyor mu (soft 404). Ağ kısmı lib/audit-extra.ts'te.
 */

export type SignalVerdict = { ok: boolean; title: string; detail: string; recommendation: string } | null;

/** lastmod: hiç yoksa ya da hepsi aynı gün (sistem her taramada "bugün" yazıyor) ise sorun. */
export function lastmodVerdict(lastmods: string[], urlCount: number): SignalVerdict {
  if (urlCount < 3) return null;
  const days = lastmods.map((d) => d.trim().slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!days.length)
    return { ok: false, title: "Site haritasında güncelleme tarihi (lastmod) yok", detail: `${urlCount} adreste lastmod yok.`, recommendation: "Her sayfa için gerçek son değişiklik tarihini lastmod olarak yaz; Google ve AI tarayıcıları güncel sayfaları buna göre önceliklendirir." };
  const distinct = new Set(days);
  if (days.length >= 5 && distinct.size === 1)
    return { ok: false, title: "Site haritasındaki tarihler gerçek değil", detail: `${days.length} adresin hepsinde aynı tarih: ${days[0]}.`, recommendation: "lastmod her sayfanın içeriği gerçekten değiştiğinde güncellenmeli; hepsine aynı tarihi yazmak sinyali değersizleştirir ve tarayıcılar tarihi yok sayar." };
  return { ok: true, title: "Site haritası tarihleri gerçekçi", detail: `${distinct.size} farklı tarih (${days.length} adres).`, recommendation: "" };
}

/** robots.txt'de Content-Signal (AI ile arama / eğitim / cevap girdisi tercihi) satırı. */
export function contentSignalVerdict(robotsText: string | null): SignalVerdict {
  if (robotsText == null) return null;
  const line = robotsText.split(/\r?\n/).find((l) => /^\s*content-signal\s*:/i.test(l));
  if (line) return { ok: true, title: "robots.txt'de AI içerik kullanım tercihi var", detail: line.trim(), recommendation: "" };
  return {
    ok: false,
    title: "robots.txt'de AI içerik kullanım tercihi belirtilmemiş",
    detail: "Content-Signal satırı yok.",
    recommendation: "robots.txt'ye içeriğinin aramada ve AI cevaplarında kullanılabileceğini, eğitimde ise isteğine göre kullanılıp kullanılamayacağını söyleyen satırı ekle: Content-Signal: search=yes, ai-input=yes, ai-train=no",
  };
}

/** Olmayan bir adres için (yönlendirmeler takip edildikten sonra) son durum: 404/410 doğru; 200 soft 404; başka sayfada 200 = yönlendirme. */
export function soft404Verdict(status: number | null, probeUrl: string, landedOn: string | null = null): SignalVerdict {
  if (status == null) return null;
  const moved = landedOn != null && landedOn.replace(/\/+$/, "") !== probeUrl.replace(/\/+$/, "");
  if (moved && status >= 200 && status < 300)
    return { ok: false, title: "Olmayan sayfalar 404 yerine başka sayfaya yönleniyor", detail: `${probeUrl} → ${landedOn}`, recommendation: "Var olmayan adresleri ana sayfaya ya da başka bir sayfaya yönlendirmek soft 404 sayılır; bu adresler 404 (ya da 410) dönmeli." };
  if (status === 404 || status === 410) return { ok: true, title: "Olmayan sayfalar 404 dönüyor", detail: `${probeUrl} → ${status}`, recommendation: "" };
  if (status >= 200 && status < 300)
    return { ok: false, title: "Olmayan sayfalar 404 yerine 200 dönüyor (soft 404)", detail: `${probeUrl} → ${status}`, recommendation: "Var olmayan adresler 404 (ya da 410) durum koduyla dönmeli; 200 dönen boş sayfalar dizine girip tarama bütçesini harcar ve AI'a hatalı içerik gösterir." };
  if (status >= 500)
    return { ok: false, title: `Olmayan sayfalar 404 yerine sunucu hatası (${status}) dönüyor`, detail: `${probeUrl} → ${status}`, recommendation: "Var olmayan adresler 404 dönmeli; 5xx dönen site tarayıcılara 'sunucu sorunlu' sinyali verir, tarama yavaşlar ve gerçek sayfalar da daha seyrek taranır." };
  return null;
}
