import { getSessionCookieName } from "./auth";

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:3000";

/**
 * CSRF check for mutating requests (POST/PATCH/DELETE).
 * Fail-closed when session cookie is present:
 * - If cookie present but no matching Origin/Referer → 403
 * - If no cookie (non-browser client) → pass through
 */
export function checkCsrf(req: Request): { ok: boolean; error?: string } {
  const method = req.method.toUpperCase();

  // Only check mutating methods
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    return { ok: true };
  }

  // Check if session cookie is present (= browser context)
  const cookieHeader = req.headers.get("cookie") || "";
  const hasCookie = cookieHeader.includes(`${getSessionCookieName()}=`);

  // Non-browser clients (no cookie) → no CSRF risk
  if (!hasCookie) {
    return { ok: true };
  }

  // Browser context: verify Origin or Referer
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin === ALLOWED_ORIGIN) return { ok: true };
    return { ok: false, error: "CSRF: Origin mismatch" };
  }

  // Fallback: check Referer
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.origin === ALLOWED_ORIGIN) return { ok: true };
    } catch {
      // invalid referer URL
    }
    return { ok: false, error: "CSRF: Referer mismatch" };
  }

  // Cookie present but neither Origin nor Referer → fail closed
  return { ok: false, error: "CSRF: No Origin or Referer with cookie" };
}
