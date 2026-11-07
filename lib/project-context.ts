/**
 * Aktif projenin (sol menüdeki seçici) marka bilgileri — AI'a giden tüm yazma/öneri
 * istekleri bu bloğu kullanır: marka, site, açıklama, hedef kitle, ton, hitap, kaçınılacaklar,
 * ürünler, avantajlar, CTA ve proje bilgi bankası. Proje yoksa kullanıcı düzeyindeki eski
 * bilgi bankasına düşer.
 */
import { cookies } from "next/headers";
import { getBrandKnowledge, getClient, getClientSettings, listClients, type ProjectSettings } from "@/lib/db";

export interface ActiveProject {
  id: number;
  name: string;
  domain: string;
  competitors: { name: string; domain: string }[];
  settings: ProjectSettings;
}

const norm = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

export async function getActiveProject(userId: number, domain?: string | null): Promise<ActiveProject | null> {
  if (domain) {
    // Belirli bir site için (ör. Autoblog cron'u): o siteye ait projeyi bul.
    const m = (await listClients(userId)).find((c) => norm(c.domain) === norm(domain));
    if (m) return { id: m.id, name: m.name, domain: norm(m.domain), competitors: m.competitors, settings: await getClientSettings(userId, m.id) };
    return null;
  }
  let id = NaN;
  try {
    id = Number((await cookies()).get("epicsem_project")?.value);
  } catch {
    /* istek dışı çağrı (cron) */
  }
  const c = (id ? await getClient(userId, id) : null) ?? (await listClients(userId))[0] ?? null;
  if (!c) return null;
  return { id: c.id, name: c.name, domain: norm(c.domain), competitors: c.competitors, settings: await getClientSettings(userId, c.id) };
}

const TONE: Record<string, string> = {
  professional: "profesyonel, net ve güven veren",
  friendly: "samimi, sıcak ve sohbet havasında",
  expert: "uzman ve otoriter; terimleri sade açıklayan",
  simple: "çok sade, kısa cümlelerle, yeni başlayanlara uygun",
};

/** AI prompt'una eklenecek marka bağlamı (boşsa boş string). */
export async function projectContextBlock(userId: number, domain?: string | null): Promise<string> {
  const p = await getActiveProject(userId, domain);
  const legacy = (await getBrandKnowledge(userId).catch(() => ({ content: "" }))).content;
  if (!p) {
    const k = legacy.trim();
    return k ? `\n\nMARKA BİLGİ BANKASI (doğru kabul edilecek bilgiler; burada olmayanı uydurma):\n"""\n${k.slice(0, 6000)}\n"""\n` : "";
  }
  const s = p.settings;
  const lines: string[] = [`Marka: ${p.name} (${p.domain})`];
  if (s.description) lines.push(`Ne yapıyor: ${s.description}`);
  if (s.audience) lines.push(`Hedef kitle: ${s.audience}`);
  if (s.country || s.language) lines.push(`Pazar: ${[s.country, s.language && `dil ${s.language}`].filter(Boolean).join(", ")}`);
  if (s.tone) lines.push(`Ton: ${TONE[s.tone] ?? s.tone}`);
  if (s.address) lines.push(`Okura hitap: "${s.address}" (Türkçe metinlerde)`);
  if (s.voiceNotes) lines.push(`Marka sesi notları: ${s.voiceNotes}`);
  if (s.avoid) lines.push(`Kullanma / kaçın: ${s.avoid}`);
  if (s.products) lines.push(`Ürünler / hizmetler: ${s.products}`);
  if (s.usps) lines.push(`Öne çıkan avantajlar: ${s.usps}`);
  if (s.cta) lines.push(`Tercih edilen harekete geçirici mesaj: ${s.cta}`);
  if (p.competitors.length) lines.push(`Rakipler (övme, karşılaştırmada adil ol): ${p.competitors.map((c) => c.name).join(", ")}`);
  const k = (s.knowledge ?? "").trim() || legacy.trim();
  return `\n\nMARKA BAĞLAMI (marka sahibinin verdiği, doğru kabul edilecek bilgiler — ürün, fiyat, adres, avantaj vb. için YALNIZCA bunları ve sayfadaki bilgileri kullan; burada olmayanı uydurma; ton ve hitaba uy):\n"""\n${lines.join("\n")}${k ? `\n\nBilgi bankası:\n${k.slice(0, 6000)}` : ""}\n"""\n`;
}
