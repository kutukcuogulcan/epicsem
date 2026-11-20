import { knowledgeBlock } from "@/lib/knowledge-prompt";
import type { EngineId, GeneratedArticle } from "@/types";
import type { ContentBrief } from "@/lib/content-brief";
import { PROVIDERS, isDemoMode, type ProviderResponse, type RunOptions } from "@/lib/geo-providers";
import { fetchPageSummary, type PageSummary } from "@/lib/content-fetch";
import { extractJsonObject } from "@/lib/llm-json";

/**
 * AI content generation grounded in a real ContentBrief — a page's actual gap-analysis
 * findings (lost prompts, missing headings, concrete content gaps), never a bare topic
 * string. This is the deliberate difference from Arvow's "thin, auto-generated content"
 * pattern documented in user complaints: the model is instructed to only use facts
 * already present in the brief and to leave an explicit [NEEDS: ...] placeholder for
 * anything it can't ground, rather than invent statistics, pricing, or claims.
 */

interface BrandRef {
  name: string;
  domain: string;
}

// Preference order: general-purpose long-form writers first: Anthropic/OpenAI generally
// produce the most reliably-structured long-form JSON; DeepSeek/xAI/Google as fallbacks.
const PREFERRED_ORDER: EngineId[] = ["anthropic", "openai", "google", "perplexity", "deepseek", "xai"];

function pickProvider() {
  for (const id of PREFERRED_ORDER) {
    const p = PROVIDERS[id];
    if (p.isConfigured()) return p;
  }
  return null;
}

function buildGenerationPrompt(brief: ContentBrief, brand: BrandRef, format: "article" | "listicle" = "article"): string {
  const lines: string[] = [];
  if (format === "listicle") {
    lines.push(
      `You are writing a LISTICLE (a numbered/bulleted list-format article, e.g. "7 things to check before...") for ${brand.name} (${brand.domain}) to close a real content gap found by an SEO/GEO (generative engine optimization) audit on ${brief.url}. Structure the body as a numbered list of items (## headings per item is fine), not prose paragraphs.`
    );
  } else {
    lines.push(
      `You are writing a page/article for ${brand.name} (${brand.domain}) to close a real content gap found by an SEO/GEO (generative engine optimization) audit on ${brief.url}.`
    );
  }
  lines.push(`Gap analysis verdict: "${brief.verdict}" — ${brief.reason}`);

  if (brief.targetQuestions.length > 0) {
    lines.push("");
    lines.push("Real questions AI answer engines are being asked where this brand currently loses to a competitor or isn't mentioned at all — answer each one directly, answer-first (the direct answer in the opening sentence, not buried):");
    for (const q of brief.targetQuestions) lines.push(`- ${q}`);
  }

  if (brief.suggestedHeadings.length > 0) {
    lines.push("");
    lines.push("Suggested headings/sections to cover:");
    for (const h of brief.suggestedHeadings) lines.push(`- ${h}`);
  }

  if (brief.contentGaps.length > 0) {
    lines.push("");
    lines.push("Specific content gaps this audit found on the page:");
    for (const g of brief.contentGaps) lines.push(`- ${g}`);
  }

  lines.push("");
  lines.push(EDITORIAL_RULES);
  lines.push("");
  lines.push(
    "CRITICAL constraint: do not invent facts, statistics, pricing, dates, customer counts, awards, or any claim about the brand that isn't general, safely-known information. Where the article needs a specific fact you don't have (a price, a stat, a proof point), write a placeholder in the exact form [NEEDS: short description of the missing fact] instead of making one up. This placeholder convention is required, not optional."
  );
  lines.push("");
  lines.push(articleShape("1000-1500 words"));

  return lines.join("\n");
}

function extractJson(text: string): any {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // fall through to the throw below
      }
    }
    throw new Error("Model response wasn't valid JSON — try generating again.");
  }
}

function demoArticle(brief: ContentBrief, brand: BrandRef): GeneratedArticle {
  const heading = brief.suggestedHeadings[0] ?? `${brand.name}: ${brief.url}`;
  const title = heading.length > 60 ? heading.slice(0, 57) + "..." : heading;
  const sections = (brief.suggestedHeadings.length > 0 ? brief.suggestedHeadings : brief.targetQuestions)
    .slice(0, 4)
    .map(
      (h) =>
        `## ${h}\n\n[DEMO DATA — connect OPENAI_API_KEY or ANTHROPIC_API_KEY in .env to generate a real, grounded draft here instead of this placeholder.] ${brand.name} would answer this directly in the opening sentence, then expand with specifics. [NEEDS: real supporting detail from ${brand.domain}]`
    )
    .join("\n\n");
  const gapsNote = brief.contentGaps.length > 0 ? `\n\n## Gaps this closes\n\n${brief.contentGaps.map((g) => `- ${g}`).join("\n")}` : "";

  return {
    title,
    metaDescription: `[DEMO DATA] A ${brand.name} answer to: ${brief.targetQuestions[0] ?? heading}`.slice(0, 160),
    bodyMarkdown: `${sections}${gapsNote}\n\n*[DEMO DATA — this entire draft is simulated. No API key is configured, so nothing was actually generated by a model.]*`,
    openPlaceholders: sections.match(/\[NEEDS:[^\]]*\]/g) ?? [],
    demoMode: true,
    model: "demo (no API key configured)",
  };
}

const LANG_NAMES: Record<string, string> = { tr: "Turkish", en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch", ar: "Arabic", ru: "Russian", pt: "Portuguese" };

/** Autoblog stil seçenekleri — dil ve "Öne çıkanlar" bölümü. */
export function styleInstructions(opts: { language?: string; takeaways?: boolean } = {}): string {
  const lines: string[] = [];
  if (opts.language) lines.push(`Write the entire article (title, meta description, body) in ${LANG_NAMES[opts.language] ?? opts.language}.`);
  if (opts.takeaways)
    lines.push(
      `Right after the opening answer paragraph, add a "## ${opts.language && opts.language !== "tr" ? "Key takeaways" : "Öne çıkanlar"}" section with 3-5 short bullet points summarizing the article.`
    );
  return lines.length ? "\n\n" + lines.join("\n") : "";
}

export async function generateArticleFromBrief(
  brief: ContentBrief,
  brand: BrandRef,
  format: "article" | "listicle" = "article",
  knowledge?: string,
  extra?: string
): Promise<GeneratedArticle> {
  // Respect the global DEMO_MODE override the same way lib/geo-engine.ts does — a key
  // being present shouldn't force a real (billable) call if DEMO_MODE=true was set
  // deliberately. Route callers use this same check to decide whether to enforce quota.
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) return demoArticle(brief, brand);

  const prompt = buildGenerationPrompt(brief, brand, format) + (extra ?? "") + knowledgeBlock(knowledge);
  return runArticle(provider, prompt);
}

const ARTICLE_MARK = /^\s*===\s*ARTICLE\s*===\s*$/m;
const END_MARK = /^\s*===\s*END\s*===\s*$/m;

function placeholdersIn(md: string): string[] {
  return Array.from(new Set(md.match(/\[NEEDS:[^\]]*\]/g) ?? []));
}

function stripOuterFence(text: string): string {
  return text.trim().replace(/^```(?:markdown|md|text)?\s*\n/i, "").replace(/\n?```\s*$/, "");
}

interface ParsedArticle {
  article: GeneratedArticle;
  /** ===END=== görüldü mü (ya da eski JSON biçimi eksiksiz parse edildi mi). */
  ended: boolean;
}

/** Ayraçlı metni (ya da model JSON'a dönerse eski JSON biçimini) okur. */
function parseArticleText(text: string, model: string): ParsedArticle {
  const raw = stripOuterFence(text);
  const am = raw.match(ARTICLE_MARK);
  if (am && am.index != null) {
    const head = raw.slice(0, am.index);
    let body = raw.slice(am.index + am[0].length);
    const em = body.match(END_MARK);
    const ended = Boolean(em && em.index != null);
    if (em && em.index != null) body = body.slice(0, em.index);
    const field = (k: string) => head.match(new RegExp(`^\\s*\\**${k}\\**\\s*:\\s*(.+)$`, "mi"))?.[1]?.trim() ?? "";
    const bodyMarkdown = body.trim().replace(/^#\s+.+\n+/, "");
    const title = field("TITLE").replace(/^["“]|["”]$/g, "");
    if (!title || !bodyMarkdown) throw new Error("Model yanıtında başlık ya da yazı gövdesi yok.");
    return {
      ended,
      article: {
        title,
        metaDescription: field("META").replace(/^["“]|["”]$/g, ""),
        bodyMarkdown,
        openPlaceholders: placeholdersIn(bodyMarkdown),
        imageQueries: field("IMAGE_QUERIES").split("|").map((q) => q.trim().replace(/^["']|["']$/g, "").slice(0, 60)).filter(Boolean).slice(0, 2),
        demoMode: false,
        model,
      },
    };
  }
  // Eski biçim: JSON. Yalnızca katı parse kabul edilir; kesik JSON "onarılıp" tam sayılmaz.
  let parsed: any;
  let ended = true;
  try {
    parsed = extractJson(text);
  } catch {
    parsed = extractJsonObject(text);
    ended = false;
  }
  if (!parsed.title || !parsed.bodyMarkdown) throw new Error("Model response was missing required fields (title/bodyMarkdown).");
  const bodyMarkdown = String(parsed.bodyMarkdown);
  return {
    ended,
    article: {
      title: String(parsed.title),
      metaDescription: String(parsed.metaDescription ?? ""),
      bodyMarkdown,
      openPlaceholders: placeholdersIn(bodyMarkdown),
      imageQueries: (Array.isArray(parsed.imageQueries) ? parsed.imageQueries : []).map((q: unknown) => String(q).trim().slice(0, 60)).filter(Boolean).slice(0, 2),
      demoMode: false,
      model,
    },
  };
}

/** Kesilen yazının son kısmı — devam isteminde bağlam olarak verilir. */
function tailOf(md: string, chars = 3500): string {
  return md.length <= chars ? md : md.slice(md.length - chars);
}

/** Devam metnini mevcut gövdeye ekler; model son cümleyi tekrar ettiyse üst üste binen kısmı atar. */
function appendContinuation(body: string, cont: string): string {
  // Baştaki boşluk korunur: token sınırında kesilen metinde kelime sınırını o gösterir.
  let c = cont.replace(/^\s*```(?:markdown|md|text)?[ \t]*\n/i, "").replace(/\n?```\s*$/, "").replace(ARTICLE_MARK, "");
  const tail = body.slice(-400);
  for (let n = Math.min(tail.length, c.length); n >= 40; n--) {
    if (tail.endsWith(c.slice(0, n))) {
      c = c.slice(n);
      break;
    }
  }
  // Kelimenin ortasında kesildiyse boşluksuz birleştir, aksi halde gerekirse satır/boşluk ekle.
  const midWord = /[\p{L}\p{N}]$/u.test(body) && /^[\p{Ll}\p{N}]/u.test(c);
  const sep = midWord || /\s$/.test(body) || /^\s/.test(c) ? "" : " ";
  return body + sep + c;
}

const MAX_CONTINUATIONS = 2;

/**
 * Makaleyi üretir: 16k token ister; yanıt kesilirse (token sınırı ya da ===END=== yok)
 * kaldığı yerden en fazla 2 kez devam ettirir. Yine bitmezse `incomplete: true` işaretler —
 * yarım yazı asla tam gibi teslim edilmez.
 */
export async function runArticle(provider: { run: (prompt: string, options?: RunOptions) => Promise<ProviderResponse> }, prompt: string, temperature?: number): Promise<GeneratedArticle> {
  const first = await provider.run(prompt, { maxTokens: 16000, ...(temperature != null ? { temperature } : {}) });
  const { article, ended } = parseArticleText(first.text, first.model);
  let done = ended && !first.truncated;
  let body = article.bodyMarkdown;
  for (let i = 0; i < MAX_CONTINUATIONS && !done; i++) {
    const contPrompt = `${prompt}

---
CONTINUATION TASK: Your previous answer was cut off before the article was finished. Below is the END of what you already wrote (title: "${article.title}"). Continue the article EXACTLY where it stops — mid-sentence if needed. Do not repeat anything already written, do not restart, do not output TITLE/META/IMAGE_QUERIES or ===ARTICLE===. Write the remaining sections (including the FAQ and the closing summary if they are not written yet), then put ===END=== on its own last line.

ALREADY WRITTEN (last part):
${tailOf(body)}`;
    const r = await provider.run(contPrompt, { maxTokens: 16000, ...(temperature != null ? { temperature } : {}) });
    let cont = r.text;
    const em = cont.match(END_MARK);
    const contEnded = Boolean(em && em.index != null);
    if (em && em.index != null) cont = cont.slice(0, em.index);
    body = appendContinuation(body, cont.replace(/\s+$/, ""));
    done = contEnded && !r.truncated;
  }
  body = body.trim();
  return {
    ...article,
    bodyMarkdown: body,
    openPlaceholders: placeholdersIn(body),
    ...(done ? {} : { incomplete: true }),
  };
}


/**
 * Editoryal kalite kuralları — "AI yazısı gibi" duran, dolgu cümleli, yüzeysel metni engeller.
 * Hem ilk yazımda hem kalite düzeltmesinde kullanılır.
 */
/**
 * Okuru ikna eden ürün yerleştirmesi (Arvow/Outrank bloglarındaki "aracımız burada nasıl yardım eder" karşılığı).
 * Markanın yalnızca verilen bağlamda/sayfasında yazan özellikleri kullanılır; yoksa not eklenmez.
 */
export function productPlacementRules(brand: BrandRef): string {
  return `PRODUCT PLACEMENT (the article is published on ${brand.name}'s site and must show the reader how ${brand.name} helps — honestly):
- After the body of 2-4 main ## sections whose topic ${brand.name} really covers, add ONE single-line blockquote note: "> **${brand.name}'<locative suffix>:** <1-2 sentences on how ${brand.name} handles exactly this point>". Use the correct Turkish locative suffix for the brand name (e.g. Paraşüt'te, Logo'da); in other languages write "> **With ${brand.name}:** …".
- Once, after the 2nd or 3rd main section, add ONE single-line product box: "> **${brand.name} ile <short topic phrase>:** <feature> · <feature> · <feature>. [<call to action>](https://${brand.domain})". Three features, separated by " · ".
- Every feature or claim in these notes MUST come from the brand context / knowledge base or ${brand.name}'s own page text given below. If nothing there matches a section, add no note to that section. Never invent features, prices, trial lengths, integrations or numbers. Never add a note inside the FAQ.
- Keep the rest of the article neutral and useful; these notes are the only promotional parts besides the closing call to action.`;
}

export const EDITORIAL_RULES = `EDITORIAL QUALITY RULES (follow all of them):
1. Answer-first: the opening paragraph answers the topic directly in 2-3 sentences (40-60 words) that could be quoted on its own by an AI answer engine. Then EVERY ## section starts with a 1-2 sentence direct answer to its heading before expanding.
2. Be specific, not generic: concrete steps, real examples, criteria, numbers from the verified sources, common mistakes and how to avoid them, who it is / isn't for. Each section must teach something a reader could act on today. No paragraph that could be pasted into any other article.
3. Structure for scanning: ## headings phrased as the questions people ask; short paragraphs (max 3-4 sentences, under 90 words); numbered lists for processes, bullet lists for options; at least one markdown table (comparison, checklist, or summary) when the topic allows.
4. Cover the topic completely: include definitions of key terms, the "how", the "why", alternatives/comparisons, and practical tips. Prefer depth over repetition.
5. Keyword: use the exact main keyword in the title, in the first 100 words and in at least one ## heading — and otherwise only 3-6 more times in the whole article (keyword density 0.5-2%). Everywhere else use synonyms, pronouns, shorter forms and related terms. No single word (other than function words) may make up more than 3% of the text — e.g. do not repeat "kredi" or the brand name in every sentence.
6. Forbidden filler (never use these or similar): "Günümüzde", "Bu yazımızda / bu yazıda ... ele alacağız", "Sonuç olarak" as an empty wrap-up, "unutmamak gerekir ki", "son derece önemlidir", "hayati önem taşır", "In today's world", "In this article we will", "It is important to note", "In conclusion", "delve", "landscape", "game-changer". No rhetorical questions as openers. No empty superlatives.
7. Brand: mention the brand where it genuinely helps the reader (a relevant service, method or example) — 2-4 times in total, never as an advert in every section, and never claim things about the brand that are not in the provided material.
8. End with a short practical summary (checklist or 3-5 bullet "what to do next"), not a generic conclusion paragraph.
9. Freshness: mention the current year (${new Date().getFullYear()}) naturally once (e.g. "${new Date().getFullYear()} itibarıyla"), only where it is true.
10. Placeholders: use at most 2 [NEEDS: ...] placeholders, only for brand-specific facts that are essential. Otherwise rewrite the sentence so it gives useful general guidance without needing the missing fact (e.g. "faiz oranları bankaya ve vadeye göre değişir; güncel oranı resmi sitesinden kontrol et").
11. Do NOT put a # (H1) title in bodyMarkdown — the title is added separately. Start with the answer paragraph.`;

/**
 * Makale çıktı biçimi: JSON DEĞİL, ayraçlı düz metin. Uzun Türkçe makaleler JSON içinde
 * token sınırına takılıp kesiliyor, jsonrepair de kesik JSON'u sessizce "onarıp" yarım
 * yazıyı tam gibi teslim ediyordu. Ayraçlı metinde kesilme ===END=== eksikliğinden anlaşılır
 * ve runArticle() kaldığı yerden devam ettirir.
 */
function articleShape(length: string): string {
  return `OUTPUT FORMAT — plain text, NOT JSON, no code fences, no commentary. Use exactly these lines, in this order:
TITLE: <50-60 character SEO title>
META: <140-160 character meta description>
IMAGE_QUERIES: <two short ENGLISH stock-photo search queries of 2-3 concrete visual words, separated by " | " (e.g. credit card payment | family budget planning)>
===ARTICLE===
<the full article in markdown, using ## / ### headings, answer-first paragraphs, lists and tables where useful — ${length}>
===END===
Write the whole article; never stop early or summarise the rest. The ===END=== line must be the very last line.`;
}

const RESPONSE_SHAPE_INSTRUCTIONS = articleShape("1200-1600 words unless ADDITIONAL REQUIREMENTS give another length");

const NO_FABRICATION_RULE =
  "CRITICAL constraint: do not invent facts, statistics, pricing, dates, customer counts, awards, or any claim that isn't either general safely-known information or literally present in the real page content quoted above. Where the article needs a specific fact you don't have, write a placeholder in the exact form [NEEDS: short description of the missing fact] instead of making one up. This placeholder convention is required, not optional.";

function summarizeForPrompt(label: string, page: PageSummary): string {
  return [
    `${label} (${page.url}):`,
    page.title ? `Title: ${page.title}` : null,
    page.metaDescription ? `Meta description: ${page.metaDescription}` : null,
    `Visible page text (truncated): ${page.bodyText || "(page returned no readable text)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * URL-grounded Content Hub input types — news reaction, competitor comparison, and
 * "alternatives to X" pages. Same two-step discipline as lib/article-audit.ts: fetch the
 * real page(s) first (lib/content-fetch.ts), then hand ONLY that extracted text to the
 * model. Comparison/alternatives also fetch the brand's own domain so the model has real
 * material for "us" too, instead of inventing what the brand offers.
 */
export async function generateArticleFromUrlInput(
  kind: "news" | "comparison" | "alternatives",
  sourceUrl: string,
  brand: BrandRef,
  knowledge?: string
): Promise<GeneratedArticle> {
  const sourcePage = await fetchPageSummary(sourceUrl);
  const ownPage = kind === "news" ? null : await fetchPageSummary(brand.domain).catch(() => null);

  const lines: string[] = [];
  if (kind === "news") {
    lines.push(
      `You are writing a brand-perspective article for ${brand.name} (${brand.domain}) reacting to / summarizing the real news article below, adding the brand's relevant angle where genuinely applicable.`
    );
  } else if (kind === "comparison") {
    lines.push(
      `You are writing a comparison article: "${brand.name} vs the competitor at ${sourcePage.url}" — based ONLY on the real page content extracted below for each side.`
    );
  } else {
    lines.push(
      `You are writing an "alternatives to ${sourcePage.title ?? sourcePage.url}" article for ${brand.name} (${brand.domain}), positioning ${brand.name} as one real alternative — based ONLY on the real page content extracted below.`
    );
  }

  lines.push("");
  lines.push(summarizeForPrompt(kind === "news" ? "Source article" : "Competitor page", sourcePage));
  if (ownPage) {
    lines.push("");
    lines.push(summarizeForPrompt(`${brand.name}'s own page`, ownPage));
  } else if (kind !== "news") {
    lines.push("");
    lines.push(`(Could not fetch ${brand.domain} — write about ${brand.name} only in general terms and use [NEEDS: ...] for anything specific.)`);
  }

  lines.push("");
  lines.push(NO_FABRICATION_RULE);
  lines.push("");
  lines.push(RESPONSE_SHAPE_INSTRUCTIONS);

  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) {
    return {
      title: `[DEMO] ${kind === "news" ? "Haber temelli yazı" : kind === "comparison" ? "Karşılaştırma" : "Alternatifler"}: ${sourcePage.title ?? sourcePage.url}`,
      metaDescription: `[DEMO DATA] Gerçek bir API anahtarı tanımlanmadığı için bu taslak simüle edildi.`,
      bodyMarkdown: `[DEMO DATA — connect OPENAI_API_KEY or ANTHROPIC_API_KEY in .env to generate a real, grounded draft here instead of this placeholder.]\n\nKaynak: ${sourcePage.url}\n\n[NEEDS: gerçek model çağrısı olmadan bu bölüm doldurulamaz]`,
      openPlaceholders: ["[NEEDS: gerçek model çağrısı olmadan bu bölüm doldurulamaz]"],
      demoMode: true,
      model: "demo (no API key configured)",
    };
  }

  return runArticle(provider, lines.join("\n") + knowledgeBlock(knowledge));
}

/**
 * Autoblog: bir anahtar kelimeden (ya da metni okunamayan bir RSS öğesinden) makale.
 * Yine "uydurma yok" kuralı geçerli — markanın kendi ana sayfası ve varsa kaynak özeti
 * modele verilir, bilinmeyen her şey [NEEDS: ...] olarak bırakılır.
 */
export async function generateArticleFromTopic(
  topic: string,
  brand: BrandRef,
  opts: {
    format?: "article" | "listicle";
    context?: string | null;
    sourceUrl?: string | null;
    knowledge?: string;
    language?: string;
    takeaways?: boolean;
    /** Editör sihirbazı: kullanıcının seçtiği başlık ve onayladığı plan. */
    title?: string;
    outline?: { h2: string; h3?: string[]; note?: string }[];
    faqQuestions?: string[];
    /** Uzunluk, ton, iç link gibi ek talimatlar (en sona eklenir, öncekileri geçersiz kılar). */
    brief?: string;
  } = {}
): Promise<GeneratedArticle> {
  const format = opts.format ?? "article";
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider && opts.outline?.length) {
    const parts: string[] = [`[DEMO DATA — gerçek bir API anahtarı tanımlı olmadığı için bu taslak simüle edildi.] ${brand.name}, "${topic}" sorusunu ilk cümlede doğrudan cevaplar. [NEEDS: ${brand.domain} için gerçek bir örnek ya da veri]`];
    for (const sec of opts.outline) {
      parts.push(`## ${sec.h2}`, `${sec.note || "Bu bölümün sorusunu ilk cümlede doğrudan cevapla."} [NEEDS: gerçek içerik]`);
      for (const h of sec.h3 ?? []) parts.push(`### ${h}`, "[NEEDS: alt bölüm içeriği]");
    }
    if (opts.faqQuestions?.length) {
      parts.push("## Sık sorulan sorular");
      for (const q of opts.faqQuestions) parts.push(`### ${q}`, "[NEEDS: kısa cevap]");
    }
    const body = parts.join("\n\n");
    return {
      title: (opts.title || topic).slice(0, 70),
      metaDescription: `[DEMO DATA] ${brand.name}: ${opts.title || topic}`.slice(0, 160),
      bodyMarkdown: body,
      openPlaceholders: body.match(/\[NEEDS:[^\]]*\]/g) ?? [],
      demoMode: true,
      model: "demo (no API key configured)",
    };
  }
  if (!provider) {
    const body = [
      `## ${topic}`,
      `[DEMO DATA — gerçek bir API anahtarı tanımlı olmadığı için bu taslak simüle edildi.] ${brand.name}, "${topic}" sorusunu ilk cümlede doğrudan cevaplar, sonra ayrıntılara iner. [NEEDS: ${brand.domain} için gerçek bir örnek ya da veri]`,
      `## Sık sorulan sorular`,
      `### ${topic} neden önemli?`,
      `[NEEDS: markaya özgü gerçek cevap]`,
    ].join("\n\n");
    return {
      title: `[DEMO] ${topic}`.slice(0, 60),
      metaDescription: `[DEMO DATA] ${brand.name}: ${topic}`.slice(0, 160),
      bodyMarkdown: body,
      openPlaceholders: body.match(/\[NEEDS:[^\]]*\]/g) ?? [],
      demoMode: true,
      model: "demo (no API key configured)",
    };
  }

  const own = await fetchPageSummary(brand.domain).catch(() => null);
  const lines: string[] = [];
  lines.push(
    format === "listicle"
      ? `You are writing a LISTICLE (numbered list-format article, ## heading per item) for ${brand.name} (${brand.domain}) targeting the search topic / keyword: "${topic}".`
      : `You are writing an SEO + GEO (generative engine optimization) optimized article for ${brand.name} (${brand.domain}) targeting the search topic / keyword: "${topic}".`
  );
  lines.push(
    (opts.language ? "" : "Write in the same language as the topic (default: Turkish). ") + "Write like a senior subject-matter expert and editor, for a reader who wants a complete, trustworthy answer. End with a '## Sık sorulan sorular' section of 3-5 real questions, each answered in 40-60 words (in the article's language; use 'Frequently asked questions' etc. for other languages)."
  );
  lines.push("");
  lines.push(EDITORIAL_RULES);
  if (opts.title) {
    lines.push("");
    lines.push(`Use exactly this article title (you may lightly polish grammar, keep the meaning): "${opts.title}"`);
  }
  if (opts.outline?.length) {
    lines.push("");
    lines.push("Follow this approved outline in this order. Use the ## and ### headings as given (same wording); the note under each tells you what to cover:");
    for (const sec of opts.outline) {
      lines.push(`## ${sec.h2}${sec.note ? `  — note: ${sec.note}` : ""}`);
      for (const h of sec.h3 ?? []) lines.push(`### ${h}`);
    }
  }
  if (opts.faqQuestions?.length) {
    lines.push("");
    lines.push(`In the FAQ section answer these questions (concise, 1-3 sentences each): ${opts.faqQuestions.map((q) => `"${q}"`).join(", ")}`);
  }
  if (opts.context) {
    lines.push("");
    lines.push(`Source material${opts.sourceUrl ? ` (${opts.sourceUrl})` : ""} — use it as the factual basis, rewrite in your own words, never copy sentences:`);
    lines.push(opts.context.slice(0, 4000));
  }
  if (own) {
    lines.push("");
    lines.push(summarizeForPrompt(`${brand.name}'s own page`, own));
  }
  // Ürünü yazının içine yerleştir — yalnızca markanın gerçek bilgisi varsa (bilgi bankası/proje bağlamı ya da kendi sayfası).
  if (own || (opts.knowledge ?? "").trim()) {
    lines.push("");
    lines.push(productPlacementRules(brand));
  }
  lines.push("");
  lines.push(NO_FABRICATION_RULE);
  lines.push("");
  lines.push(RESPONSE_SHAPE_INSTRUCTIONS);

  const prompt = lines.join("\n") + styleInstructions(opts) + knowledgeBlock(opts.knowledge) + (opts.brief ? `\n\nADDITIONAL REQUIREMENTS (these override any earlier length or style instruction):\n${opts.brief}` : "");
  try {
    return await runArticle(provider, prompt);
  } catch {
    // Bir kez daha dene: model bazen biçimi bozar (ayraçları atlar). Uzunluk talimatı değişmez.
    return runArticle(provider, prompt + "\n\nIMPORTANT: Follow the OUTPUT FORMAT exactly: TITLE:, META:, IMAGE_QUERIES: lines, then ===ARTICLE===, the full article, and ===END===.");
  }
}


/**
 * Kalite düzeltmesi: yazıyı kural tabanlı puanlamada eksik çıkan maddelere göre bir kez iyileştirir.
 * Gerçek bilgileri, kaynak linklerini, görsel/video satırlarını ve [NEEDS: ...] alanlarını korur; yeni rakam uydurmaz.
 */
export async function reviseArticle(
  article: GeneratedArticle,
  issues: string[],
  opts: { keyword: string; language?: string; knowledge?: string }
): Promise<GeneratedArticle | null> {
  const provider = isDemoMode() ? null : pickProvider();
  if (!provider) return null;
  const prompt = `You are a senior editor. Improve the article below so it fixes every issue in the list. Keep the language (${opts.language ? LANG_NAMES[opts.language] ?? opts.language : "same as the article"}), the topic, the main structure, every factual statement, every markdown link (sources and internal links), every image line (![...](...)), every standalone YouTube URL line and every [NEEDS: ...] placeholder exactly (unless an issue below explicitly asks you to reduce the placeholders). Do NOT invent new statistics, prices, dates or brand claims. Do not shorten the article; expand thin sections instead.
Main keyword: "${opts.keyword}"

ISSUES TO FIX:
${issues.map((i) => `- ${i}`).join("\n")}

${EDITORIAL_RULES}

CURRENT TITLE: ${article.title}
CURRENT META DESCRIPTION: ${article.metaDescription}
CURRENT ARTICLE (markdown):
${article.bodyMarkdown}
${knowledgeBlock(opts.knowledge)}

${articleShape("at least as long as the current article")}`;
  try {
    const out = await runArticle(provider, prompt);
    if (out.incomplete) return null;
    // güvenlik: belirgin kısalma ya da kaybolan link/görsel varsa reddet
    const links = (md: string) => (md.match(/\]\(https?:\/\/[^)]+\)/g) ?? []).length;
    if (out.bodyMarkdown.length < article.bodyMarkdown.length * 0.8) return null;
    if (links(out.bodyMarkdown) < links(article.bodyMarkdown) - 1) return null;
    return out;
  } catch {
    return null;
  }
}
