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

// Tool pages get the sidebar app-shell instead of the marketing top-nav — see
// app/layout.tsx. Broader than PROTECTED_PREFIXES (e.g. /dashboard, /campaigns aren't
// login-gated behind middleware, but are still "app", not "marketing").
const APP_SHELL_PREFIXES = [
  "/dashboard",
  "/audit",
  "/geo",
  "/gap",
  "/article-writer",
  "/monitor",
  "/campaigns",
  "/import",
  "/content",
  "/local",
  "/clients",
  "/prompts",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Forward the pathname as a request header so app/layout.tsx — a shared server
  // component with no other way to know which page it's rendering — can read it via
  // headers() and pick the sidebar app-shell vs. the marketing top-nav shell.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  const isAppShell = APP_SHELL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  requestHeaders.set("x-shell", isAppShell ? "app" : "marketing");
  const passthrough = () => NextResponse.next({ request: { headers: requestHeaders } });

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return passthrough();

  // Temporary open-access switch for pre-launch testing (DEMO_OPEN_ACCESS=true on
  // Render) — see lib/auth.ts's isOpenAccessEnabled()/getCurrentUser() for the
  // server-side half (falls back to a shared demo account). Read directly from
  // process.env here rather than importing lib/auth.ts, which pulls in node:crypto
  // and isn't Edge-safe.
  if (process.env.DEMO_OPEN_ACCESS === "true") return passthrough();

  const hasCookie = req.cookies.has(SESSION_COOKIE);
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return passthrough();
}

export const config = {
  // Runs on every page request (not just the previously-protected ones) so the
  // x-pathname/x-shell headers are always set for app/layout.tsx — excludes static
  // assets, API routes, and files with an extension (images, robots.txt, etc.).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"],
};
