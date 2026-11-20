import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Kullanıcının verdiği adreslere giden her istek için `fetch` yerine kullanılır (aynı imza).
 * - Her yönlendirmede adresi çözer; özel/iç ağ IP'lerini (localhost, 10.x, 169.254.x…) reddeder (SSRF).
 * - Süre sınırı gövde okunurken de geçerli (varsayılan 20 sn).
 * - Gövde boyutu sınırlı (varsayılan 10 MB); dönen Response'un gövdesi zaten okunmuş durumda.
 * shortcut: DNS rebinding kapalı değil (kontrol ve istek ayrı çözümlüyor); gerekirse IP'yi undici Agent lookup ile sabitle.
 */

export class UnsafeUrlError extends Error {}

export function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:") && isIP(v.slice(7)) === 4) return privateIp(v.slice(7));
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("64:ff9b:");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

async function assertPublic(u: URL): Promise<void> {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UnsafeUrlError("Yalnızca http/https adresleri açılabilir.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  let addrs: { address: string }[];
  try {
    addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("Alan adı bulunamadı.");
  }
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new UnsafeUrlError("Bu adres açılamaz (iç ağ adresi).");
}

const NULL_BODY = new Set([101, 204, 205, 304]);

export async function safeFetch(input: string | URL, init: RequestInit = {}, opts: { timeoutMs?: number; maxBytes?: number } = {}): Promise<Response> {
  const maxBytes = opts.maxBytes ?? 10_000_000;
  const signal = AbortSignal.any([AbortSignal.timeout(opts.timeoutMs ?? 20_000), ...(init.signal ? [init.signal] : [])]);
  const follow = init.redirect !== "manual";
  let url = new URL(String(input));
  let req: RequestInit = { ...init, signal, redirect: "manual" };

  for (let hop = 0; ; hop++) {
    await assertPublic(url);
    const res = await fetch(url, req);
    const loc = res.headers.get("location");
    if (follow && loc && res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      if (hop >= 5) throw new Error("Çok fazla yönlendirme.");
      url = new URL(loc, url);
      if (res.status !== 307 && res.status !== 308 && req.method && !/^(GET|HEAD)$/i.test(req.method)) req = { ...req, method: "GET", body: undefined };
      continue;
    }

    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) {
      await res.body?.cancel().catch(() => {});
      throw new Error("Yanıt çok büyük.");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error("Yanıt çok büyük.");
        }
        chunks.push(value);
      }
    }
    const out = new Response(NULL_BODY.has(res.status) ? null : Buffer.concat(chunks), { status: res.status, statusText: res.statusText, headers: res.headers });
    Object.defineProperty(out, "url", { value: url.toString() });
    return out;
  }
}
