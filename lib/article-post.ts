/**
 * Yazıya AI kullanmadan son dokunuşlar — otomatik içindekiler listesi.
 * İlk "## " başlığından hemen önce, tüm ## başlıklarının listesini ekler.
 */
export function addTableOfContents(markdown: string, language = "tr"): string {
  const lines = markdown.split("\n");
  const heads = lines.filter((l) => /^##\s+/.test(l)).map((l) => l.replace(/^##\s+/, "").trim());
  if (heads.length < 3 || /^##\s+(İçindekiler|Table of contents)/im.test(markdown)) return markdown;
  const first = lines.findIndex((l) => /^##\s+/.test(l));
  const label = language === "tr" ? "İçindekiler" : "Table of contents";
  const toc = [`## ${label}`, "", ...heads.map((h, i) => `${i + 1}. ${h}`), ""];
  return [...lines.slice(0, first), ...toc, ...lines.slice(first)].join("\n");
}
