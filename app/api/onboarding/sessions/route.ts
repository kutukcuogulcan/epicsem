import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOnboardingSession } from "@/lib/db";
import { runOnboardingChain } from "@/lib/onboarding-engine";
import { isDemoMode } from "@/lib/geo-providers";
import { requireUser } from "@/lib/auth";
import { readableZodError } from "@/lib/zod-error";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { checkQuota, quotaExceededMessage } from "@/lib/usage-guard";

const bodySchema = z.object({
  url: z.string().min(3),
  language: z.enum(["tr", "en"]).default("tr"),
  country: z.string().min(1).default("Türkiye"),
});

/** POST /api/onboarding/sessions — Kart: Otomatik onboarding zinciri.
 *
 * Called the instant the wizard's URL field loses focus (blur), not on a button click. Opens
 * an onboarding_sessions row and kicks off the whole chain (Tarama → Profil ‖ Rakipler →
 * Topic'ler → Promptlar) server-side WITHOUT waiting for it to finish — responds 202 with just
 * the session id immediately. The wizard polls GET .../[id] to watch it fill in, and a page
 * refresh resumes by re-polling the same id (carried in the URL's query string). */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 });

  const limitResult = rateLimit(`onboarding-session:${user.id}`, 20, 60 * 60 * 1000);
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached — up to 20 calls per hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limitResult.resetAt)) } }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: readableZodError(err) }, { status: 400 });
  }

  const demoMode = isDemoMode();
  // 3 "otomatik kurulum adımı" ünitesi rezerve edilir — manuel akışta da discover(1) +
  // discover-topics(1) + discover-prompts(1) = 3 ünite harcanıyordu; burada zincir tamamlanırken
  // adım adım (lib/onboarding-engine.ts) düşülür, böylece yarıda kalan bir zincir kullanıcıyı
  // fazladan ücretlendirmez.
  if (!demoMode) {
    const quota = await checkQuota(user.id, "onboardingSetup", 3);
    if (!quota.allowed) {
      return NextResponse.json({ error: quotaExceededMessage("onboardingSetup", quota, 3) }, { status: 402 });
    }
  }

  const sessionId = await createOnboardingSession(user.id, parsed.url.trim(), parsed.language, parsed.country);

  // Fire-and-forget: Render runs this as a persistent Node process (not a serverless
  // function killed right after the response), so this un-awaited promise keeps running
  // after the 202 below returns. A failure inside the chain is already handled per-step
  // (lib/onboarding-engine.ts marks that step 'error' and writes it to the row) — this catch
  // is only a last-resort net for something escaping that, e.g. a DB write itself failing.
  runOnboardingChain(sessionId, user.id).catch((err) => {
    console.error("onboarding chain crashed:", err);
  });

  return NextResponse.json({ sessionId }, { status: 202 });
}
