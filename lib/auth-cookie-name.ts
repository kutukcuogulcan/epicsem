/**
 * Just the cookie name, split out from lib/auth.ts so middleware.ts (Edge runtime,
 * no node:sqlite) can import it without pulling in lib/db.ts.
 */
export const SESSION_COOKIE = "epicsem_session";
