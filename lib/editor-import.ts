import * as cheerio from "cheerio";

/** Bir sayfanın ana içeriğini markdown'a çevirir (AI yok). Editöre "adresten aç" için. */
export async function importPageAsMarkdown(url: string): Promise<{ title: string; metaDescription: string; markdown: string; keyword: string }> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 12000);
  let html: string;
  try {
    const res = await fetch(url, { signal: c.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; EpicsemBot/1.0)" } });
    if (!res.ok) throw new Error(`Sayfa ${res.status} döndürdü`);
    html = await res.text();
  } catch (e) {
    throw new Error(e instanceof Error && e.message.startsWith("Sayfa") ? e.message : "Sayfa açılamadı.");
  } finally {
    clearTimeout(t);
  }
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim();
  const metaDescription = $('meta[name="description" i]').attr("content")?.trim() ?? "";
  $("script, style, noscript, svg, nav, header, footer, aside, form, iframe, [role=navigation], .menu, .nav, .sidebar, .cookie, #cookie").remove();
  const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");

  const out: string[] = [];
  const txt = (el: any) => $(el).text().replace(/\s+/g, " ").trim();
  const inl = (el: any) => {
    const clone = $(el).clone();
    clone.find("a[href]").each((_, a) => {
      const href = $(a).attr("href");
      const t2 = $(a).text().replace(/\s+/g, " ").trim();
      if (href && t2) {
        try {
          $(a).replaceWith(`[${t2}](${new URL(href, url).toString()})`);
        } catch {}
      }
    });
    clone.find("strong, b").each((_, b) => void $(b).replaceWith(`**${$(b).text().trim()}**`));
    return clone.text().replace(/\s+/g, " ").trim();
  };
  root.find("h1, h2, h3, h4, p, ul, ol, blockquote, img, table").each((_, el) => {
    const tag = (el as any).tagName?.toLowerCase();
    // iç içe öğeleri iki kez yazma
    if ($(el).parents("ul, ol, blockquote, table").length && tag !== "img") return;
    if (tag === "img") {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (!src || src.startsWith("data:")) return;
      try {
        out.push(`![${($(el).attr("alt") ?? "").replace(/[\]|]/g, " ")}](${new URL(src, url).toString()})`);
      } catch {}
      return;
    }
    if (tag === "h1") out.push(`# ${txt(el)}`);
    else if (tag === "h2") out.push(`## ${txt(el)}`);
    else if (tag === "h3" || tag === "h4") out.push(`### ${txt(el)}`);
    else if (tag === "p") {
      const s = inl(el);
      if (s.length > 1) out.push(s);
    } else if (tag === "ul" || tag === "ol") {
      const items = $(el).children("li").map((i, li) => `${tag === "ol" ? `${i + 1}.` : "-"} ${inl(li)}`).get().filter((x) => x.length > 2);
      if (items.length) out.push(items.join("\n"));
    } else if (tag === "blockquote") out.push(`> ${txt(el)}`);
    else if (tag === "table") {
      const rows = $(el).find("tr").map((_, tr) => `| ${$(tr).find("th, td").map((__, c) => txt(c).replace(/\|/g, "/")).get().join(" | ")} |`).get();
      if (rows.length) {
        const cols = rows[0].split("|").length - 2;
        rows.splice(1, 0, `| ${Array(cols).fill("---").join(" | ")} |`);
        out.push(rows.join("\n"));
      }
    }
  });
  const markdown = out.filter((x, i) => x && x !== out[i - 1]).join("\n\n");
  if (markdown.replace(/\s/g, "").length < 50) throw new Error("Sayfada okunabilir metin bulunamadı (içerik JavaScript ile yükleniyor olabilir).");
  const h1 = $("h1").first().text().trim();
  return { title, metaDescription, markdown, keyword: (h1 || title).split(/[|\-–:]/)[0].trim().slice(0, 60) };
}
