import { NextRequest, NextResponse } from "next/server";
import { GUEST_COOKIE, SESSION_COOKIE } from "@/lib/auth-cookie-name";

/**
 * Cheap, Edge-safe gate: redirect to /login if the session cookie is simply absent.
 * This is a UX convenience, not the security boundary — real validation (does the
 * token exist in the sessions table, has it expired) happens server-side via
 * requireUser() in every API route and in lib/auth.ts's getCurrentUser(). Kept
 * deliberately dumb (no DB access, no node:sqlite import) so it can run in the Edge
 * middleware runtime without pulling in Node-only APIs.
 */
const PROTECTED_PREFIXES = ["/billing", "/audit", "/geo", "/monitor", "/clients", "/import", "/content", "/editor", "/assistant", "/feeds", "/keywords", "/rankings", "/integrations", "/bing", "/backlinks", "/brand-monitors", "/knowledge", "/indexing", "/project", "/onboarding", "/calendar"];

// Tool pages get the sidebar app-shell instead of the marketing top-nav — see
// app/layout.tsx. Broader than PROTECTED_PREFIXES (e.g. /dashboard, /campaigns aren't
// login-gated behind middleware, but are still "app", not "marketing").
const APP_SHELL_PREFIXES = [
  "/dashboard",
  "/calendar",
  "/audit",
  "/geo",
  "/gap",
  "/article-writer", "/editor", "/assistant",
  "/monitor",
  "/campaigns",
  "/feeds",
  "/keywords",
  "/rankings",
  "/integrations",
  "/bing",
  "/backlinks",
  "/import",
  "/content",
  "/local",
  "/clients",
  "/prompts",
  "/billing",
  "/brand-monitors",
  "/knowledge",
  "/indexing",
  "/project",
  "/onboarding",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Forward the pathname as a request header so app/layout.tsx — a shared server
  // component with no other way to know which page it's rendering — can read it via
  // headers() and pick the sidebar app-shell vs. the marketing top-nav shell.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  // Giriş yapmış kullanıcı ana sayfada satış sayfası değil, kendi paneliyle karşılaşır.
  if (pathname === "/" && req.cookies.has(SESSION_COOKIE)) return NextResponse.redirect(new URL("/dashboard", req.url));
  const isAppShell = APP_SHELL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  requestHeaders.set("x-shell", isAppShell ? "app" : "marketing");
  // Açık erişim: oturumu olmayan her tarayıcıya kendi çalışma alanı kimliği (lib/auth.ts misafir hesabına bağlar).
  // Botlara verilmez: her istekte çerezsiz gelen tarayıcılar sınırsız hesap açtırmasın.
  let newGuest: string | null = null;
  // Oturum çerezi olsa da verilir: oturum geçersizse (silinmiş/süresi dolmuş) kullanıcı ortak hesaba değil kendi alanına düşer;
  // geçerli oturum her zaman önce gelir (lib/auth.ts), misafir hesabı yalnızca gerekirse açılır.
  if (
    process.env.DEMO_OPEN_ACCESS === "true" &&
    !req.cookies.has(GUEST_COOKIE) &&
    !/bot|crawl|spider|slurp|preview|fetch|curl|wget|python|headless|lighthouse/i.test(req.headers.get("user-agent") ?? "")
  ) {
    newGuest = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    // Aynı isteğin sunucu tarafı da yeni kimliği görsün.
    requestHeaders.set("cookie", `${req.headers.get("cookie") ? `${req.headers.get("cookie")}; ` : ""}${GUEST_COOKIE}=${newGuest}`);
  }
  const passthrough = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    if (newGuest) res.cookies.set(GUEST_COOKIE, newGuest, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  };

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
  // Uzantılı statik dosyalar hariç; /brand-monitors/ornek.com gibi alan adı içeren yollar dahil.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|css|js|txt|xml|woff2?|ttf|otf|map|json|pdf|zip)$).*)"],
};
