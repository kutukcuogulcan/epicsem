import PDFDocument from "pdfkit";
import type { GapRow, GeoVisibilitySummary, SeoAuditResult } from "@/types";
import type { ContentBrief } from "./content-brief";

/**
 * White-label PDF export — the "agency workflow" differentiator. Epicsem-branded
 * (purple accent, agency name in the header/footer) so it's something you can hand
 * a client directly, not a raw data dump.
 */

const ACCENT = "#7c3aed";
const INK = "#1e1b29";
const MUTED = "#6b6478";
const DANGER = "#dc2626";
const SEO_GREEN = "#16a34a";
const WARN = "#d97706";

export interface ReportInput {
  agencyName?: string;
  clientName: string;
  clientDomain: string;
  generatedAt: string;
  audit?: SeoAuditResult | null;
  geo?: { summaries: GeoVisibilitySummary[] } | null;
  gap?: { gapMatrix: GapRow[]; contentBriefs?: ContentBrief[] } | null;
}

const LEFT = 48;

export function buildReportPdf(input: ReportInput): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: LEFT, bufferPages: true });
  const agency = input.agencyName?.trim() || "Epicsem";

  // pdfkit's cursor (doc.x) sticks at whatever x an explicit-position .text() call used —
  // it does NOT reset to the page margin on its own. Every multi-column block below (the
  // score gauges, the GEO table) must call this before the next plain .text() call, or
  // that next paragraph silently renders in a narrow column starting from the old x.
  function resetX() {
    doc.x = LEFT;
  }

  function header() {
    doc.fillColor(ACCENT).fontSize(10).font("Helvetica-Bold").text(agency.toUpperCase(), { continued: false });
    doc.fillColor(MUTED).fontSize(9).font("Helvetica").text("SEO + GEO/AEO/AXO report", { continued: false });
    doc.moveDown(0.3);
    doc.strokeColor("#e5e0f5").lineWidth(1).moveTo(LEFT, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(0.8);
    resetX();
  }

  function sectionTitle(text: string) {
    resetX();
    doc.moveDown(0.6);
    resetX();
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(14).text(text, LEFT, doc.y);
    doc.moveDown(0.3);
    resetX();
  }

  function label(text: string) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(text, LEFT, doc.y);
    resetX();
  }

  function scoreColor(score: number) {
    if (score >= 70) return SEO_GREEN;
    if (score >= 40) return WARN;
    return DANGER;
  }

  header();

  // ---- Title block ----
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(22).text(input.clientName, LEFT, doc.y);
  doc.fillColor(MUTED).font("Helvetica").fontSize(11).text(input.clientDomain, LEFT, doc.y);
  doc.moveDown(0.2);
  doc.fillColor(MUTED).fontSize(9).text(`Generated ${new Date(input.generatedAt).toLocaleString()}`, LEFT, doc.y);

  // ---- Audit summary ----
  if (input.audit) {
    const a = input.audit;
    sectionTitle("SEO + AXO Audit");
    const startY = doc.y;
    doc.fillColor(scoreColor(a.score)).font("Helvetica-Bold").fontSize(28).text(String(a.score), LEFT, startY);
    doc.fillColor(scoreColor(a.aiCrawlScore)).font("Helvetica-Bold").fontSize(28).text(String(a.aiCrawlScore), 200, startY);
    doc.y = startY + 34;
    resetX();
    label("Technical SEO score");
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text("AI crawlability (AXO) score", 200, doc.y - 12);
    doc.y = startY + 34 + 14;
    resetX();
    doc.moveDown(0.8);
    resetX();

    const blocked = a.meta.aiBotAccess.filter((b) => !b.allowed);
    doc.fillColor(INK).font("Helvetica").fontSize(10);
    doc.text(`Title: ${a.meta.title ?? "—"}`, LEFT, doc.y);
    doc.text(`Word count: ~${a.meta.wordCount}`, LEFT, doc.y);
    doc.text(`Structured data: ${a.meta.hasSchema ? a.meta.schemaTypes.join(", ") : "none"}`, LEFT, doc.y);
    doc.fillColor(blocked.length > 0 ? DANGER : SEO_GREEN).text(
      blocked.length > 0
        ? `${blocked.length} AI crawler(s) blocked: ${blocked.map((b) => b.bot).join(", ")}`
        : "No AI crawlers blocked",
      LEFT,
      doc.y
    );

    const critical = a.issues.filter((i) => i.severity === "critical" || i.severity === "warning");
    if (critical.length > 0) {
      doc.moveDown(0.5);
      resetX();
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("Top issues to fix", LEFT, doc.y);
      doc.font("Helvetica").fontSize(9.5);
      for (const issue of critical.slice(0, 8)) {
        doc.fillColor(issue.severity === "critical" ? DANGER : WARN).text(`• ${issue.title}`, LEFT, doc.y);
        if (issue.recommendation) {
          doc.fillColor(MUTED).text(`   ${issue.recommendation}`, LEFT, doc.y, { width: 480 });
        }
      }
    }

    if (a.fixes.length > 0) {
      doc.moveDown(0.5);
      resetX();
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(`Ready-to-paste fixes generated (${a.fixes.length})`, LEFT, doc.y);
      doc.font("Helvetica").fontSize(9.5).fillColor(MUTED);
      for (const fix of a.fixes) doc.text(`• ${fix.label} — see the full app for the copy-paste code.`, LEFT, doc.y);
    }
  }

  // ---- GEO summary ----
  if (input.geo && input.geo.summaries.length > 0) {
    sectionTitle("GEO / AEO Visibility");
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(MUTED);
    const colX = [LEFT, 220, 300, 380, 460];
    doc.text("Brand", colX[0], doc.y, { continued: false, width: 160 });
    let rowY = doc.y - 11;
    doc.text("Visibility", colX[1], rowY);
    doc.text("SOV", colX[2], rowY);
    doc.text("Sentiment", colX[3], rowY);
    doc.text("Citations", colX[4], rowY);
    resetX();
    doc.moveDown(0.3);
    doc.strokeColor("#e5e0f5").moveTo(LEFT, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(0.2);
    resetX();

    doc.font("Helvetica").fontSize(9.5);
    for (const s of input.geo.summaries) {
      rowY = doc.y;
      doc.fillColor(INK).text(s.brand, colX[0], rowY, { width: 160 });
      doc.fillColor(INK).text(`${Math.round(s.visibility * 100)}%`, colX[1], rowY);
      doc.fillColor(INK).text(`${Math.round(s.shareOfVoice * 100)}%`, colX[2], rowY);
      doc.fillColor(INK).text(s.avgSentiment != null ? String(s.avgSentiment) : "—", colX[3], rowY);
      doc.fillColor(INK).text(String(s.citationCount), colX[4], rowY);
      resetX();
      doc.moveDown(0.4);
    }
    resetX();
  }

  // ---- Gap matrix ----
  if (input.gap && input.gap.gapMatrix.length > 0) {
    sectionTitle("Gap Analysis");
    doc.font("Helvetica").fontSize(9.5);
    for (const row of input.gap.gapMatrix) {
      const verdictColor =
        row.verdict === "blocked" ? DANGER : row.verdict === "cited" ? SEO_GREEN : row.verdict === "invisible" ? ACCENT : WARN;
      const verdictLabel =
        row.verdict === "blocked"
          ? "Blocked from AI"
          : row.verdict === "cited"
            ? "Cited"
            : row.verdict === "invisible"
              ? "Strong but invisible"
              : "Needs work";
      doc.fillColor(INK).font("Helvetica-Bold").text(row.url, LEFT, doc.y, { width: 480 });
      doc.font("Helvetica").fillColor(MUTED).fontSize(9).text(
        `SEO ${row.seoScore} · AXO ${row.aiCrawlScore} · ${row.blockedBots} blocked bot(s) · cited ${row.citedExact}x (page) / ${row.citedDomain}x (domain)`,
        LEFT,
        doc.y,
        { width: 480 }
      );
      doc.fillColor(verdictColor).font("Helvetica-Bold").fontSize(9).text(verdictLabel, LEFT, doc.y);
      doc.font("Helvetica").fontSize(9.5);
      doc.moveDown(0.5);
      resetX();
    }

    if (input.gap.contentBriefs && input.gap.contentBriefs.length > 0) {
      doc.moveDown(0.3);
      resetX();
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("Content briefs", LEFT, doc.y);
      doc.font("Helvetica").fontSize(9);
      for (const brief of input.gap.contentBriefs) {
        doc.moveDown(0.3);
        resetX();
        doc.fillColor(INK).font("Helvetica-Bold").fontSize(9.5).text(brief.url, LEFT, doc.y, { width: 480 });
        doc.font("Helvetica").fillColor(MUTED).text(brief.reason, LEFT, doc.y, { width: 480 });
        for (const gap of brief.contentGaps) doc.fillColor(MUTED).text(`  · ${gap}`, LEFT, doc.y, { width: 480 });
        for (const h of brief.suggestedHeadings.slice(0, 4)) doc.fillColor(ACCENT).text(`  · ${h}`, LEFT, doc.y, { width: 480 });
      }
    }
  }

  // ---- Footer on every page ----
  // Writing this close to the bottom margin can itself trigger pdfkit's automatic
  // pagination (it estimates the text would overflow and silently adds a fresh page
  // for it) — that adds a spurious extra page with nothing but a stray footer on it.
  // Temporarily removing the bottom margin for these calls avoids that entirely.
  const range = doc.bufferedPageRange();
  const footerY = doc.page.height - 36;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text(
      `${agency} — generated by the Epicsem SEO + GEO/AEO/AXO tool. Page ${i + 1} of ${range.count}.`,
      LEFT,
      footerY,
      { align: "center", width: 499, lineBreak: false }
    );
    doc.page.margins.bottom = originalBottomMargin;
  }

  return doc;
}
