import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { syncSerpBear } from "@/lib/rank-sync";
import { serpbearRefresh } from "@/lib/integrations";

/**
 * POST /api/rankings/serpbear { action: "import" | "refresh", domain? }
 *  import  → SerpBear'daki kelimeleri ve geçmişi Sıralama Takibi'ne aktarır.
 *  refresh → SerpBear'a domaindeki tüm kelimeleri yeniden taratır (SerpBear'ın kendi kaynağıyla).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });
  const rl = rateLimit(`serpbear:${user.id}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: "Saatlik SerpBear işlem sınırına ulaştın." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const domain = typeof body.domain === "string" && body.domain.trim() ? body.domain.trim().toLowerCase() : undefined;
  try {
    if (body.action === "refresh") {
      if (!domain) return NextResponse.json({ error: "Yenilemek için bir domain seç." }, { status: 400 });
      const n = await serpbearRefresh(user.id, domain);
      return NextResponse.json({ refreshing: n });
    }
    return NextResponse.json(await syncSerpBear(user.id, domain));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "SerpBear hatası" }, { status: 502 });
  }
}
