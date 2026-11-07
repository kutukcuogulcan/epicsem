/** Yazının sitedeki durumu için tek tip etiket (Tüm Yazılar, Genel Bakış). */
export interface PublishStateInput {
  status?: string | null;
  publishState?: string | null;
  scheduledAt?: string | null;
  publishError?: string | null;
}
export function publishLabel(d: PublishStateInput): { key: "draft" | "remote-draft" | "scheduled" | "published" | "error"; label: string; cls: string; hint?: string } {
  const st = d.publishState ?? (d.status === "published-to-wp" || d.status === "published" ? "remote-draft" : null);
  if (st === "error") return { key: "error", label: "Hata", cls: "bg-danger/10 text-danger", hint: d.publishError ?? "Siteye gönderilemedi" };
  if (st === "published") return { key: "published", label: "Yayında", cls: "bg-seo/10 text-seo" };
  if (st === "scheduled" && d.scheduledAt) {
    if (new Date(d.scheduledAt).getTime() <= Date.now()) return { key: "published", label: "Yayında", cls: "bg-seo/10 text-seo" };
    const when = new Date(d.scheduledAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return { key: "scheduled", label: `Zamanlandı · ${when}`, cls: "bg-accent/10 text-accent" };
  }
  if (st === "remote-draft") return { key: "remote-draft", label: "Sitede taslak", cls: "bg-warn/10 text-warn" };
  return { key: "draft", label: "Taslak", cls: "bg-muted text-ink/55" };
}
