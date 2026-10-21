import { NextRequest, NextResponse } from "next/server";
import { DEMO_EMAIL, requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { deleteIntegration, getIntegration, listIntegrations, saveIntegration } from "@/lib/db";
import { providerById, type ProviderId } from "@/lib/integration-providers";
import { testIntegration } from "@/lib/integrations";
import { newIndexNowKey, validKey } from "@/lib/indexnow";

/**
 * Kullanıcı entegrasyonları. Gizli alanlar istemciye yalnızca maskeli döner.
 * GET → bağlı servisler · POST { provider, config, secrets } → kaydet + bağlantıyı test et · DELETE ?provider=
 */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  return NextResponse.json({ integrations: await listIntegrations(user.id), envSerpApi: !!process.env.SERPAPI_API_KEY, sharedDemo: user.email === DEMO_EMAIL });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  // Açık erişim modunda girişsiz herkes aynı demo hesabını paylaşır — oraya anahtar kaydetmek
  // anahtarı diğer ziyaretçilere açar. Bu yüzden ortak demo hesabında kayıt kapalı.
  if (user.email === DEMO_EMAIL) return NextResponse.json({ error: "Ortak demo hesabında anahtar kaydedilemez — kendi hesabınla giriş yap (Kayıt ol / Giriş)." }, { status: 403 });
  const rl = rateLimit(`integrations:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Çok fazla deneme — biraz sonra tekrar dene." }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const def = providerById(String(b.provider ?? ""));
  if (!def) return NextResponse.json({ error: "Bilinmeyen servis." }, { status: 400 });
  const cur = await getIntegration(user.id, def.id);
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const f of def.fields) {
    const raw = String((f.secret ? b.secrets?.[f.key] : b.config?.[f.key]) ?? "").trim().slice(0, 2000);
    if (f.secret) secrets[f.key] = raw;
    else config[f.key] = raw;
    const has = raw || (f.secret && cur?.secrets[f.key]);
    if (!f.optional && !has) return NextResponse.json({ error: `"${f.label}" gerekli.` }, { status: 400 });
  }
  if (config.baseUrl) {
    try {
      const u = new URL(config.baseUrl);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      config.baseUrl = u.toString().replace(/\/+$/, "");
    } catch {
      return NextResponse.json({ error: "Geçerli bir adres gir (https://…)." }, { status: 400 });
    }
  }
  if (def.id === "indexnow") {
    config.key = config.key || cur?.config.key || newIndexNowKey();
    if (!validKey(config.key)) return NextResponse.json({ error: "Anahtar 8–128 karakter olmalı; sadece harf, rakam ve tire." }, { status: 400 });
  }
  await saveIntegration(user.id, def.id, config, secrets);
  const saved = (await getIntegration(user.id, def.id))!;
  let ok = true;
  let message: string;
  try {
    message = await testIntegration(def.id as ProviderId, saved.config, saved.secrets, user.id);
  } catch (e) {
    ok = false;
    message = e instanceof Error ? e.message : "Bağlantı kurulamadı";
  }
  await saveIntegration(user.id, def.id, { ...saved.config, _status: ok ? "ok" : "error", _message: message.slice(0, 300), _checkedAt: new Date().toISOString() }, {});
  return NextResponse.json({ ok, message });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const provider = req.nextUrl.searchParams.get("provider") ?? "";
  if (!providerById(provider)) return NextResponse.json({ error: "Bilinmeyen servis." }, { status: 400 });
  await deleteIntegration(user.id, provider);
  return NextResponse.json({ ok: true });
}
