import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isDemoMode } from "@/lib/geo-providers";
import { readableZodError } from "@/lib/zod-error";
import { projectContextBlock } from "@/lib/project-context";
import { guardSmallAi, QuotaError, runSmallAiJson, str } from "@/lib/ai-small";

export const maxDuration = 45;

const bodySchema = z.object({
  site: z.string().min(3).max(200),
  kind: z.enum(["unlinked", "lost", "gap"]),
  target: z.object({ domain: z.string().min(3).max(200), url: z.string().max(500).optional(), title: z.string().max(300).optional() }),
});

/**
 * POST /api/backlinks/outreach — link isteme e-postası TASLAĞI (gönderilmez).
 * unlinked: markayı linksiz anan habere link ricası · lost: kaldırılan linki geri isteme · gap: rakiplere link veren siteye tanışma.
 * 1 AI motor sorgusu.
 */
export async function POST(req: NextRequest) {
  const g = await guardSmallAi("bl-outreach", 30);
  if (g instanceof NextResponse) return g;
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }
  if (isDemoMode())
    return NextResponse.json({ demo: true, result: { subject: `${body.target.domain} — kısa bir rica`, body: "Merhaba,\n\nDemo mod: gerçek anahtar tanımlanınca kişiselleştirilmiş e-posta taslağı burada görünür.\n\nTeşekkürler" } });

  const ctx = await projectContextBlock(g.userId).catch(() => "");
  const goal =
    body.kind === "unlinked"
      ? `Bu yazı/haber markamızı anıyor ama sitemize (${body.site}) link vermiyor. Yazara teşekkür edip, okuyucular için kolaylık olsun diye ilgili yere link eklemesini nazikçe rica et.`
      : body.kind === "lost"
        ? `Bu site daha önce ${body.site} sitesine link veriyordu, link kaldırılmış ya da sayfa değişmiş. Durumu nazikçe sorup güncel bir sayfamıza linkin geri eklenmesini rica et.`
        : `Bu site rakiplerimize link veriyor ama bize (${body.site}) vermiyor. Kendimizi kısaca tanıt, okuyucularına değer katacak somut bir içerik/kaynak öner; satış dili kullanma.`;
  const prompt = `Bir link isteme e-postası TASLAĞI yaz. Türkçe, kısa (en fazla 120 kelime), samimi ama profesyonel; spam gibi durmasın, abartılı iltifat ve uydurma bilgi olmasın. Alıcının adını bilmiyoruz ("Merhaba," ile başla).
${ctx}
Bizim site: ${body.site}
Alıcı site: ${body.target.domain}${body.target.title ? `\nİlgili yazı: "${body.target.title}"` : ""}${body.target.url ? ` (${body.target.url})` : ""}
Amaç: ${goal}
Yalnızca şu JSON'u döndür: {"subject":"en fazla 60 karakter konu","body":"e-posta metni, \\n ile satırlar, sonda [Adınız] imza yeri"}`;
  try {
    const p = await runSmallAiJson(g.userId, prompt);
    return NextResponse.json({ result: { subject: str(p.subject, 120) ?? "", body: str(p.body, 2000) ?? "" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Taslak yazılamadı." }, { status: e instanceof QuotaError ? 402 : 500 });
  }
}
