import PDFDocument from "pdfkit";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { BulkImportResult } from "@/types";
import { ISSUE_INFO, ISSUE_LABEL, ISSUE_SEVERITY, THEMES, priorityScore } from "./bulk-labels";

/**
 * Müşteri teklifi PDF'i — bir Site Taraması sonucundan, ajansın müşteriye göndereceği
 * "GEO + SEO hizmet teklifi". Kural tabanlı, AI kullanmaz. Fikir: geo-seo-claude
 * geo-proposal (MIT). Fiyatlar ajansın girdiği değerlerdir; girilmezse "görüşmede belirlenir".
 */

export interface ProposalPackage {
  name: string;
  price: string;
  items: string[];
}

export interface ProposalInput {
  agencyName: string;
  clientName: string;
  contact?: string;
  validDays: number;
  packages: ProposalPackage[];
  note?: string;
  run: BulkImportResult;
}

export const DEFAULT_PACKAGES: ProposalPackage[] = [
  {
    name: "Başlangıç",
    price: "",
    items: ["Kritik teknik SEO hatalarının düzeltilmesi", "AI arama botlarına erişim ve robots.txt düzenlemesi", "Ana sayfa ve hizmet sayfalarına schema (yapılandırılmış veri)", "Aylık sağlık taraması ve rapor"],
  },
  {
    name: "Büyüme",
    price: "",
    items: ["Başlangıç paketindeki her şey", "Ayda 4 GEO uyumlu içerik (alıntılanabilirlik puanı 70+)", "ChatGPT, Gemini, Perplexity görünürlük takibi", "Rakip karşılaştırması ve fırsat raporu", "IndexNow ile anında indeksleme"],
  },
  {
    name: "Kurumsal",
    price: "",
    items: ["Büyüme paketindeki her şey", "Ayda 8+ içerik ve mevcut içeriklerin yenilenmesi", "Wikipedia/Wikidata ve bilgi grafı çalışması", "Sıralama takibi ve haftalık rapor", "Öncelikli destek ve aylık strateji toplantısı"],
  },
];

const ACCENT = "#5d16ff";
const INK = "#1e1b29";
const MUTED = "#6b6478";
const LINE = "#e7e3f3";
const GREEN = "#16a34a";
const WARN = "#d97706";
const RED = "#dc2626";
const L = 50;
const R = 545;
const W = R - L;

const site = (f: string) => f.split(" · ")[0].replace(" (kısmi)", "");
const tone = (n: number) => (n >= 80 ? GREEN : n >= 50 ? WARN : RED);

export async function buildProposalPdf(input: ProposalInput): Promise<Buffer> {
  const dir = path.join(process.cwd(), "assets", "fonts");
  const [bold, medium] = await Promise.all([readFile(path.join(dir, "Poppins-Bold.ttf")), readFile(path.join(dir, "Poppins-Medium.ttf"))]);
  const doc = new PDFDocument({ size: "A4", margin: L, bufferPages: true, info: { Title: `${input.clientName} — GEO + SEO Teklifi`, Author: input.agencyName } });
  doc.registerFont("B", bold);
  doc.registerFont("M", medium);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res, rej) => {
    doc.on("end", () => res(Buffer.concat(chunks)));
    doc.on("error", rej);
  });

  const run = input.run;
  const s = run.summary;
  const rows = run.rows;
  const domain = site(run.filename);
  const html = rows.filter((r) => r.statusCode === 200);
  const counts: Record<string, number> = s.issueCounts ?? {};
  if (!s.issueCounts) for (const r of rows) for (const c of r.issues) counts[c] = (counts[c] ?? 0) + 1;
  const health = s.healthScore ?? (html.length ? Math.round((html.filter((r) => !r.issues.some((c) => ISSUE_SEVERITY[c] === "error")).length / html.length) * 100) : 0);
  const today = new Date();
  const until = new Date(today.getTime() + input.validDays * 864e5);
  const fmtDate = (d: Date) => d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  const text = (t: string, o: { font?: "B" | "M"; size?: number; color?: string; x?: number; y?: number; width?: number; align?: "left" | "right" | "center"; gap?: number } = {}) => {
    doc.font(o.font ?? "M").fontSize(o.size ?? 10).fillColor(o.color ?? INK);
    if (o.x !== undefined || o.y !== undefined) doc.text(t, o.x ?? L, o.y ?? doc.y, { width: o.width ?? W, align: o.align ?? "left", lineGap: o.gap ?? 2 });
    else doc.text(t, L, doc.y, { width: o.width ?? W, align: o.align ?? "left", lineGap: o.gap ?? 2 });
  };
  const h2 = (t: string) => {
    if (doc.y > 620) doc.addPage();
    doc.moveDown(1.1);
    text(t, { font: "B", size: 15 });
    doc.moveTo(L, doc.y + 3).lineTo(L + 40, doc.y + 3).lineWidth(2).strokeColor(ACCENT).stroke();
    doc.moveDown(0.8);
  };

  // ---------- Kapak ----------
  doc.rect(0, 0, 595.28, 300).fill(ACCENT);
  text(input.agencyName.toUpperCase(), { font: "B", size: 11, color: "#ffffff", y: 60 });
  text("GEO + SEO Hizmet Teklifi", { font: "B", size: 30, color: "#ffffff", y: 120 });
  text(`${input.clientName} · ${domain}`, { size: 14, color: "#e9e2ff", y: 170 });
  text(`Hazırlanma: ${fmtDate(today)}   ·   Geçerlilik: ${fmtDate(until)}`, { size: 10, color: "#d9ceff", y: 240 });
  doc.y = 330;
  text("Bu teklif, sitenizin otomatik taramasından elde edilen gerçek bulgulara dayanır. Amaç; Google'da ve ChatGPT, Gemini, Perplexity gibi yapay zekâ asistanlarında daha görünür olmanız, önerilen ve alıntılanan kaynak hâline gelmenizdir.", { size: 11, color: MUTED, gap: 4 });

  // KPI kutuları
  const kpis: [string, string, string][] = [
    ["Site sağlığı", `${health}/100`, tone(health)],
    ["Taranan sayfa", String(rows.length), INK],
    ["Hata / uyarı", `${s.severity?.error ?? 0} / ${s.severity?.warning ?? 0}`, (s.severity?.error ?? 0) > 0 ? RED : GREEN],
    ["AI alıntılanabilirlik", s.avgCitability != null ? `${s.avgCitability}/100` : "—", s.avgCitability != null ? tone(s.avgCitability) : MUTED],
  ];
  const ky = 420;
  const kw = (W - 30) / 4;
  kpis.forEach(([l, v, c], i) => {
    const x = L + i * (kw + 10);
    doc.roundedRect(x, ky, kw, 74, 10).lineWidth(1).strokeColor(LINE).stroke();
    text(l, { size: 8.5, color: MUTED, x: x + 12, y: ky + 12, width: kw - 24 });
    text(v, { font: "B", size: 20, color: c, x: x + 12, y: ky + 32, width: kw - 24 });
  });
  doc.y = ky + 100;
  const blocked = s.site?.aiBlockedCitation ?? [];
  if (blocked.length) {
    doc.roundedRect(L, doc.y, W, 46, 8).fill("#fef2f2");
    text(`Dikkat: ${blocked.join(", ")} gibi AI arama botları sitenize erişemiyor. Bu, ChatGPT ve benzerlerinin sizi kaynak olarak gösterememesi demek.`, { size: 9.5, color: RED, x: L + 12, y: doc.y + 10, width: W - 24 });
    doc.y += 20;
  }

  // ---------- Mevcut durum ----------
  doc.addPage();
  h2("Mevcut durum");
  const themeRows = THEMES.map((t) => {
    const bad = html.filter((r) => r.issues.some((c) => t.codes.includes(c))).length;
    return { label: t.label, pct: html.length ? Math.round(((html.length - bad) / html.length) * 100) : 0 };
  });
  for (const t of themeRows) {
    const y = doc.y;
    text(t.label, { size: 10, x: L, y, width: 150 });
    doc.roundedRect(L + 160, y + 4, 280, 8, 4).fill("#f1eef9");
    doc.roundedRect(L + 160, y + 4, Math.max(4, 2.8 * t.pct), 8, 4).fill(tone(t.pct));
    text(`%${t.pct}`, { font: "B", size: 10, color: tone(t.pct), x: L + 450, y, width: 45, align: "right" });
    doc.y = y + 20;
  }
  text("Yüzdeler, ilgili alanda sorunu olmayan sayfaların oranıdır.", { size: 8.5, color: MUTED });

  h2("Öncelikli bulgular");
  const top = Object.entries(counts)
    .filter(([c]) => ISSUE_LABEL[c])
    .sort((a, b) => priorityScore(b[0], b[1]) - priorityScore(a[0], a[1]))
    .slice(0, 8);
  for (const [code, n] of top) {
    if (doc.y > 720) doc.addPage();
    const info = ISSUE_INFO[code];
    const sev = ISSUE_SEVERITY[code];
    const y = doc.y;
    doc.circle(L + 4, y + 7, 3.5).fill(sev === "error" ? RED : sev === "warning" ? WARN : MUTED);
    text(`${ISSUE_LABEL[code]}  ·  ${n} sayfa`, { font: "B", size: 10.5, x: L + 14, y, width: W - 14 });
    if (info) text(info.why, { size: 9.5, color: MUTED, x: L + 14, width: W - 14 });
    doc.moveDown(0.6);
  }
  if (!top.length) text("Kritik bir sorun bulunmadı; çalışma içerik ve AI görünürlüğüne odaklanabilir.", { color: MUTED });

  // ---------- Ne yapacağız ----------
  h2("Ne yapacağız");
  const plan: [string, string[]][] = [
    ["1. ay — Temel", ["Kritik hataların ve kırık sayfaların düzeltilmesi", "AI botlarına erişim, site haritası ve robots.txt düzenlemesi", "Başlık, açıklama ve schema eksiklerinin tamamlanması"]],
    ["2. ay — İçerik ve GEO", ["Müşterilerinizin AI'a sorduğu soruların belirlenmesi", "Bu sorulara cevap veren, alıntılanabilir içeriklerin yazılması", "Marka bilgilerinin Wikidata ve güvenilir kaynaklarda tutarlı hâle getirilmesi"]],
    ["3. ay — Ölçüm ve büyüme", ["ChatGPT, Gemini, Perplexity görünürlüğünün ölçülmesi", "Rakiplerle karşılaştırma ve yeni fırsatlar", "Aylık rapor ve sonraki çeyreğin planı"]],
  ];
  for (const [t, items] of plan) {
    if (doc.y > 700) doc.addPage();
    text(t, { font: "B", size: 11, color: ACCENT });
    for (const it of items) text(`•  ${it}`, { size: 10, x: L + 10, width: W - 10 });
    doc.moveDown(0.5);
  }

  // ---------- Paketler ----------
  doc.addPage();
  h2("Paketler");
  const pk = input.packages.filter((p) => p.name.trim()).slice(0, 3);
  const pw = (W - (pk.length - 1) * 12) / Math.max(1, pk.length);
  const py = doc.y;
  let maxH = 0;
  pk.forEach((p, i) => {
    const x = L + i * (pw + 12);
    const featured = pk.length === 3 && i === 1;
    text(p.name, { font: "B", size: 13, color: featured ? ACCENT : INK, x: x + 14, y: py + 16, width: pw - 28 });
    text(p.price.trim() || "Görüşmede belirlenir", { font: "B", size: p.price.trim() ? 16 : 11, color: INK, x: x + 14, y: py + 40, width: pw - 28 });
    doc.y = py + 74;
    for (const it of p.items.filter(Boolean)) text(`•  ${it}`, { size: 9, color: INK, x: x + 14, width: pw - 28, gap: 3 });
    maxH = Math.max(maxH, doc.y - py + 14);
  });
  pk.forEach((_, i) => {
    const x = L + i * (pw + 12);
    doc.roundedRect(x, py, pw, maxH, 12).lineWidth(pk.length === 3 && i === 1 ? 2 : 1).strokeColor(pk.length === 3 && i === 1 ? ACCENT : LINE).stroke();
  });
  doc.y = py + maxH + 20;
  if (input.note?.trim()) text(input.note.trim(), { size: 10, color: MUTED, gap: 3 });

  h2("Sonraki adım");
  text(`Teklif ${fmtDate(until)} tarihine kadar geçerlidir. Onaylamanızın ardından ilk hafta teknik düzeltmelere başlıyor, ilk raporu 30 gün içinde paylaşıyoruz.`, { size: 10.5, gap: 3 });
  if (input.contact?.trim()) {
    doc.moveDown(0.6);
    text(input.contact.trim(), { font: "B", size: 10.5, color: ACCENT });
  }

  // Alt bilgi
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (i === 0) continue;
    doc.page.margins.bottom = 0;
    doc.font("M").fontSize(8).fillColor(MUTED).text(`${input.agencyName} · ${input.clientName} için hazırlanmıştır · ${i + 1}/${range.count}`, L, 805, { width: W, align: "center", lineBreak: false });
  }
  doc.end();
  return done;
}
