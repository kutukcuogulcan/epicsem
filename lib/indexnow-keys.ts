import { getCmsConnectionSecret, getIntegration, listCmsConnections } from "./db";
import { submitIndexNow } from "./indexnow";
import { wpIndexNowKey } from "./wp-apply";

export const hostOf = (u: string) => {
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Bir site için IndexNow anahtarı: önce Entegrasyonlar'daki kayıt, sonra Epicsem Connector'lı WordPress bağlantısı. */
export async function indexNowKeyFor(userId: number, host: string): Promise<{ key: string; siteUrl: string; via: string } | null> {
  const own = await getIntegration(userId, "indexnow");
  if (own?.config.siteUrl && own.config.key && hostOf(own.config.siteUrl) === host) return { key: own.config.key, siteUrl: own.config.siteUrl, via: "manual" };
  for (const c of await listCmsConnections(userId)) {
    if (c.platform !== "wordpress" || hostOf(c.siteUrl) !== host) continue;
    const sec = await getCmsConnectionSecret(userId, c.id);
    if (!sec) continue;
    const key = await wpIndexNowKey(sec.siteUrl, sec.authIdentifier, sec.authSecret);
    if (key) return { key, siteUrl: sec.siteUrl, via: "wordpress" };
  }
  return null;
}


/** Yayınlanan bir URL'yi, sitenin IndexNow anahtarı biliniyorsa sessizce bildirir (hata atmaz). */
export async function pingIndexNow(userId: number, url: string): Promise<boolean> {
  try {
    const k = await indexNowKeyFor(userId, hostOf(url));
    if (!k) return false;
    return (await submitIndexNow(k.siteUrl, k.key, [url])).ok;
  } catch {
    return false;
  }
}
