/**
 * Bir dış link / görsel gerçekten kırık mı? 404/410 ve 5xx kırıktır. 401/403/429/999 (bot koruması: sayfa insanlar
 * için açılır) ve 0 (zaman aşımı/bağlantı) doğrulanamaz — kırık sayılmaz, yoksa footer'daki tek bir korumalı link
 * bütün sayfaları "kırık link içeriyor" diye işaretler.
 */
export function isBrokenStatus(status: number | undefined | null): boolean {
  return status != null && (status === 404 || status === 410 || (status >= 500 && status <= 599));
}
