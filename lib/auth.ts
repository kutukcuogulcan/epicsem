import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  createUser as dbCreateUser,
  findUserByEmail,
  findUserById,
  createSession as dbCreateSession,
  getSession as dbGetSession,
  deleteSession as dbDeleteSession,
  setUserPlan,
} from "@/lib/db";
import { GUEST_COOKIE, SESSION_COOKIE } from "@/lib/auth-cookie-name";

/**
 * Minimal self-hosted auth — email + password, scrypt hashing (node:crypto, no extra
 * dependency and no native binary to fetch, same reasoning as choosing node:sqlite
 * over Prisma), session tokens in a DB table, session id in an httpOnly cookie. No
 * NextAuth/Auth.js: for one credentials provider backed by our own sqlite table, a
 * ~120-line hand-rolled layer is less surface area than wiring an adapter.
 */

const SESSION_DAYS = 30;

/**
 * Temporary open-access switch for pre-launch testing (set DEMO_OPEN_ACCESS=true on
 * Render). When on, nobody needs to sign up/log in — every request that has no real
 * session is transparently treated as a single shared "demo" account instead of being
 * bounced to /login. This is a deliberate, reversible product decision, not a bug:
 * flip the env var off once real users start signing up and the login wall should
 * come back — no code or redeploy changes needed, just unset it on Render.
 */
export const DEMO_EMAIL = "demo@epicsem.local";
const DEMO_PASSWORD = "epicsem-demo-2026"; // also usable to log in manually via /login while open access is on

export function isOpenAccessEnabled(): boolean {
  return process.env.DEMO_OPEN_ACCESS === "true";
}

// Singleton promise (same cached-promise pattern as lib/db.ts's ensureSchema) so
// concurrent requests during cold start don't race to insert the same email twice.
let demoUserPromise: Promise<AuthUser> | null = null;

async function getOrCreateDemoUser(): Promise<AuthUser> {
  if (!demoUserPromise) {
    demoUserPromise = (async () => {
      const existing = await findUserByEmail(DEMO_EMAIL);
      if (existing) return { id: existing.id, email: existing.email, name: existing.name };
      const user = await dbCreateUser(DEMO_EMAIL, hashPassword(DEMO_PASSWORD), "Demo");
      return { id: user.id, email: user.email, name: user.name };
    })().catch((err) => {
      demoUserPromise = null; // let the next call retry instead of caching a failure forever
      throw err;
    });
  }
  return demoUserPromise;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const candidate = scryptSync(password, salt, 64);
  if (candidate.length !== hashBuffer.length) return false;
  return timingSafeEqual(candidate, hashBuffer);
}

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
}

export async function signup(email: string, password: string, name?: string): Promise<AuthUser> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) throw new Error("Geçerli bir e-posta girin");
  if (password.length < 8) throw new Error("Şifre en az 8 karakter olmalı");
  const existing = await findUserByEmail(normalized);
  if (existing) throw new Error("Bu e-posta zaten kayıtlı");
  const passwordHash = hashPassword(password);
  const user = await dbCreateUser(normalized, passwordHash, name?.trim() || null);
  return { id: user.id, email: user.email, name: user.name };
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const normalized = email.trim().toLowerCase();
  // Demo şifresi kodda açık; açık erişim kapalıyken demo hesabına girilemesin.
  if (normalized === DEMO_EMAIL && !isOpenAccessEnabled()) throw new Error("E-posta veya şifre hatalı");
  const user = await findUserByEmail(normalized);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("E-posta veya şifre hatalı");
  }
  return { id: user.id, email: user.email, name: user.name };
}

export async function createSessionCookie(userId: number, days = SESSION_DAYS) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await dbCreateSession(token, userId, expiresAt.toISOString());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await dbDeleteSession(token);
    } catch {
      // best-effort — clearing the cookie below is what actually logs the browser out
    }
  }
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await dbGetSession(token);
    if (session && new Date(session.expiresAt).getTime() >= Date.now()) {
      const user = await findUserById(session.userId);
      if (user) return { id: user.id, email: user.email, name: user.name };
    }
  }
  // Oturum yok. Açık erişimde tarayıcı başına çalışma alanı: middleware'in verdiği misafir kimliği kendi hesabına bağlanır,
  // böylece ziyaretçiler birbirinin projelerini görmez. Kimliksiz istekler (bot, doğrudan API) boş ortak hesaba düşer.
  if (isOpenAccessEnabled()) {
    const guest = store.get(GUEST_COOKIE)?.value;
    if (guest && /^[a-f0-9]{32}$/.test(guest)) return getOrCreateGuestUser(guest);
    return getOrCreatePublicUser();
  }
  return null;
}

const guestEmail = (id: string) => `guest-${id}@guest.epicsem.local`;

async function getOrCreateGuestUser(id: string): Promise<AuthUser> {
  const email = guestEmail(id);
  const found = await findUserByEmail(email);
  if (found) return { id: found.id, email: found.email, name: found.name };
  try {
    const u = await dbCreateUser(email, hashPassword(randomBytes(24).toString("hex")), "Misafir");
    await setUserPlan(u.id, "guest");
    return { id: u.id, email: u.email, name: u.name };
  } catch {
    // Aynı tarayıcının eşzamanlı ilk istekleri: diğeri oluşturmuş olabilir (e-posta tekil).
    const again = await findUserByEmail(email);
    if (again) return { id: again.id, email: again.email, name: again.name };
    throw new Error("Çalışma alanı açılamadı");
  }
}

/** Çerezsiz istekler için boş, misafir kotalı ortak hesap (eskiden sahibin demo hesabıydı). */
const PUBLIC_EMAIL = "public@guest.epicsem.local";
/** Paylaşılan tek hesap: buraya anahtar/site bağlantısı kaydedilmez. */
export const isSharedAccount = (email: string) => email === PUBLIC_EMAIL;
export const isGuestAccount = (email: string) => email.endsWith("@guest.epicsem.local");
let publicUserPromise: Promise<AuthUser> | null = null;
function getOrCreatePublicUser(): Promise<AuthUser> {
  if (!publicUserPromise)
    publicUserPromise = (async () => {
      const found = await findUserByEmail(PUBLIC_EMAIL);
      if (found) return { id: found.id, email: found.email, name: found.name };
      const u = await dbCreateUser(PUBLIC_EMAIL, hashPassword(randomBytes(24).toString("hex")), "Ziyaretçi");
      await setUserPlan(u.id, "guest");
      return { id: u.id, email: u.email, name: u.name };
    })().catch((e) => {
      publicUserPromise = null;
      throw e;
    });
  return publicUserPromise;
}

/** Misafir havuz sayacının tutulduğu hesap (usage_counters kullanıcıya bağlı olduğu için boş ortak hesap kullanılır). */
export async function guestPoolUserId(): Promise<number> {
  return (await getOrCreatePublicUser()).id;
}

/** Sahibin eski ortak (demo) hesabı: projelerinin durduğu hesap. Yalnızca gizli sahiplenme bağlantısıyla açılır. */
export async function demoOwnerUser(): Promise<AuthUser> {
  return getOrCreateDemoUser();
}

/** Use at the top of any API route that touches user data. Returns null if not signed in. */
export async function requireUser(): Promise<AuthUser | null> {
  return getCurrentUser();
}
