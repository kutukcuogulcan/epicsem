// İç ağ adreslerinin engellendiğini doğrular. Çalıştır: node --experimental-strip-types scripts/check-safe-fetch.mjs
import assert from "node:assert/strict";
import { blockedReason, privateIp, safeFetch, UnsafeUrlError } from "../lib/safe-fetch.ts";

for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assert.equal(privateIp(ip), true, ip);
for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700::1111", "::ffff:8.8.8.8"]) assert.equal(privateIp(ip), false, ip);

for (const u of ["http://127.0.0.1:5432/", "http://localhost/", "http://[::1]/", "file:///etc/passwd", "http://169.254.169.254/latest/meta-data/"])
  await assert.rejects(safeFetch(u), UnsafeUrlError, u);

// Herkese açık adres iç ağa yönlendirirse ikinci adımda reddedilir (ağsız: fetch taklit edilir).
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1:5432/" } });
await assert.rejects(safeFetch("http://8.8.8.8/"), UnsafeUrlError);
// Yönlendirmeyi kendisi inceleyen çağıran (redirect: "manual") 302'yi olduğu gibi alır.
assert.equal((await safeFetch("http://8.8.8.8/", { redirect: "manual" })).status, 302);
// Boyut sınırı gövde okunurken uygulanır.
globalThis.fetch = async () => new Response("x".repeat(5000));
await assert.rejects(safeFetch("http://8.8.8.8/", {}, { maxBytes: 1000 }), /çok büyük/);
assert.equal(await (await safeFetch("http://8.8.8.8/")).text(), "x".repeat(5000));
globalThis.fetch = realFetch;

// Bot koruması (Cloudflare vb.) tanınır; düz 404 / normal 503 engel sayılmaz.
const res = (status, h) => new Response("x", { status, headers: h });
assert.match(blockedReason(res(403, { "cf-mitigated": "challenge", server: "cloudflare" })), /Cloudflare bot koruması, HTTP 403/);
assert.match(blockedReason(res(403, {})), /erişim reddedildi/);
assert.match(blockedReason(res(429, { server: "AkamaiGHost" })), /Akamai bot/);
assert.equal(blockedReason(res(404, { server: "cloudflare" })), null);
assert.equal(blockedReason(res(503, { server: "nginx" })), null);

console.log("check-safe-fetch: ok");
