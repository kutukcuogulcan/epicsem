import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { claimDraftSite, saveContentDraft, updateContentDraftArticle } from "@/lib/db";
import { getActiveProject } from "@/lib/project-context";

/** POST /api/editor/save { id?, sourceUrl, title, metaDescription, markdown } → taslağı kaydet/güncelle. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const article = {
    title: String(b.title ?? "").slice(0, 300) || "Başlıksız yazı",
    metaDescription: String(b.metaDescription ?? "").slice(0, 400),
    bodyMarkdown: String(b.markdown ?? ""),
    openPlaceholders: [...String(b.markdown ?? "").matchAll(/\[NEEDS:[^\]]+\]/g)].map((m) => m[0]).slice(0, 20),
    demoMode: false,
    model: "AI SEO Editör",
  };
  if (!article.bodyMarkdown.trim()) return NextResponse.json({ error: "Kaydedilecek içerik yok." }, { status: 400 });
  // Yazı aktif projeye bağlanır (eski, sitesiz yazılar ilk kayıtta projeye geçer).
  const project = await getActiveProject(user.id).catch(() => null);
  if (b.id) {
    if (project) await claimDraftSite(user.id, Number(b.id), project.domain);
    const d = await updateContentDraftArticle(user.id, Number(b.id), article);
    if (!d) return NextResponse.json({ error: "Taslak bulunamadı" }, { status: 404 });
    return NextResponse.json({ draft: d });
  }
  const d = await saveContentDraft(user.id, String(b.sourceUrl ?? "editor"), article, null, project?.domain ?? null);
  return NextResponse.json({ draft: d });
}
