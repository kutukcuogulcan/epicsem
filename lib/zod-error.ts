import { ZodError } from "zod";

/**
 * Turns a Zod validation failure into a short, readable message instead of
 * the raw JSON issue array (which is what `err.message` gives you for a
 * ZodError) — used by API routes that validate the request body before
 * doing anything with it.
 */
export function readableZodError(err: unknown, fallback = "Invalid request body"): string {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    if (!first) return fallback;
    const path = first.path.join(".");
    return path ? `${path}: ${first.message}` : first.message;
  }
  return err instanceof Error ? err.message : fallback;
}
