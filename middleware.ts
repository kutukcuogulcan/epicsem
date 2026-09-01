import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-cookie-name";

/**
 * Cheap, Edge-safe gate: redirect to /login if the session cookie is simply absent.
 * This is a UX convenience, not the security boundary — real validation (does the
 * token exist in the sessions table, has it expired) happens server-side via
 * requireUser() in every API route and in lib/auth.ts's getCurrentUser(). Kept
 * deliberately dumb (no DB access, no node:sqlite import) so it can run in the Edge
 * middleware runtime without pulling in Node-only APIs.
 */
const PROTECTED_PREFIXES = ["/audit", "/geo", "/gap", "/monitor", "/clients", "/import", "/content"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  // Temporary open-access switch for pre-launch testing (DEMO_OPEN_ACCESS=true on
  // Render) — see lib/auth.ts's isOpenAccessEnabled()/getCurrentUser() for the
  // server-side half (falls back to a shared demo account). Read directly from
  // process.env here rather than importing lib/auth.ts, which pulls in node:crypto
  // and isn't Edge-safe.
  if (process.env.DEMO_OPEN_ACCESS === "true") return NextResponse.next();

  const hasCookie = req.cookies.has(SESSION_COOKIE);
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/audit/:path*", "/geo/:path*", "/gap/:path*", "/monitor/:path*", "/clients/:path*", "/import/:path*", "/content/:path*"],
};
