// src/lib/cron/expire.ts
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";

/**
 * Expire REQUESTED appointments that exceeded the timeout.
 * Returns number of appointments expired.
 */
export function expireTimedOutRequests(): number {
  const db = getDb();
  const now = Date.now();
  const timeoutHours = parseInt(getSetting("requestTimeoutHours"), 10);
  const timeoutMs = timeoutHours * 60 * 60 * 1000;

  const result = db
    .prepare(
      `UPDATE appointments SET status = 'EXPIRED', updated_at = ?
       WHERE status = 'REQUESTED' AND created_at < ?`
    )
    .run(now, now - timeoutMs);

  return result.changes;
}
