import { createHmac } from "crypto";
import { markdownToHtml } from "@/lib/wordpress";

/**
 * "Webhook / Zapier / Make" yayın bağlantısı — Wix, Webflow, Ghost, Framer, Squarespace,
 * GoHighLevel, Notion, Google Docs… gibi doğrudan entegrasyonumuz olmayan her platforma
 * Zapier/Make/n8n üzerinden taslak göndermeyi sağlar. Gövde HMAC-SHA256 ile imzalanır
 * (X-Epicsem-Signature: sha256=<hex>) ki alıcı isteğin Epicsem'den geldiğini doğrulayabilsin.
 */
export interface WebhookPayload {
  event: "draft.published" | "test";
  title: string;
  metaDescription: string;
  markdown: string;
  html: string;
  sourceUrl: string;
  draftId: number | null;
  sentAt: string;
  /** "draft" (varsayılan) ya da "publish" — Autoblog tam otomatik modunda "publish". */
  status?: "draft" | "publish";
  coverImageUrl?: string | null;
}

async function send(url: string, secret: string, payload: WebhookPayload) {
  const body = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: c.signal,
      headers: { "Content-Type": "application/json", "User-Agent": "Epicsem-Webhook/1.0", "X-Epicsem-Event": payload.event, "X-Epicsem-Signature": `sha256=${sig}` },
      body,
    });
    const text = await res.text().catch(() => "");
    return { status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}

export async function testWebhook(url: string, secret: string): Promise<{ ok: boolean; error?: string; siteUserName?: string }> {
  if (!/^https:\/\//i.test(url)) return { ok: false, error: "Webhook adresi https:// ile başlamalı." };
  try {
    const r = await send(url, secret, { event: "test", title: "Epicsem bağlantı testi", metaDescription: "", markdown: "Bu bir test mesajıdır.", html: "<p>Bu bir test mesajıdır.</p>", sourceUrl: "", draftId: null, sentAt: new Date().toISOString() });
    if (r.status >= 200 && r.status < 300) return { ok: true, siteUserName: `HTTP ${r.status}` };
    return { ok: false, error: `Webhook ${r.status} döndürdü` };
  } catch {
    return { ok: false, error: "Webhook adresine ulaşılamadı." };
  }
}

export async function publishDraftToWebhook(params: { url: string; secret: string; title: string; bodyMarkdown: string; excerpt: string; sourceUrl: string; draftId: number; status?: "draft" | "publish"; coverImageUrl?: string | null }): Promise<{ postUrl: string; editUrl: string }> {
  const r = await send(params.url, params.secret, {
    event: "draft.published",
    title: params.title,
    metaDescription: params.excerpt,
    markdown: params.bodyMarkdown,
    html: markdownToHtml(params.bodyMarkdown),
    sourceUrl: params.sourceUrl,
    draftId: params.draftId,
    sentAt: new Date().toISOString(),
    status: params.status ?? "draft",
    coverImageUrl: params.coverImageUrl ?? null,
  });
  if (r.status < 200 || r.status >= 300) throw new Error(`Webhook ${r.status} döndürdü`);
  // Alıcı { "url": "...", "editUrl": "..." } dönerse onları göster.
  let postUrl = "";
  let editUrl = "";
  try {
    const j = JSON.parse(r.text);
    postUrl = typeof j.url === "string" ? j.url : "";
    editUrl = typeof j.editUrl === "string" ? j.editUrl : "";
  } catch {}
  return { postUrl, editUrl };
}
