import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  createUser as dbCreateUser,
  findUserByEmail,
  findUserById,
  createSession as dbCreateSession,
  getSession as dbGetSession,
  deleteSession as dbDeleteSession,
} from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth-cookie-name";

/**
 * Minimal self-hosted auth — email + password, scrypt hashing (node:crypto, no extra
 * dependency and no native binary to fetch, same reasoning as choosing node:sqlite
 * over Prisma), session tokens in a DB table, session id in an httpOnly cookie. No
 * NextAuth/Auth.js: for one credentials provider backed by our own sqlite table, a
 * ~120-line hand-rolled layer is less surface area than wiring an adapter.
 */

const SESSION_DAYS = 30;

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
  const user = await findUserByEmail(normalized);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("E-posta veya şifre hatalı");
  }
  return { id: user.id, email: user.email, name: user.name };
}

export async function createSessionCookie(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
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
  if (!token) return null;
  const session = await dbGetSession(token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  const user = await findUserById(session.userId);
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name };
}

/** Use at the top of any API route that touches user data. Returns null if not signed in. */
export async function requireUser(): Promise<AuthUser | null> {
  return getCurrentUser();
}
