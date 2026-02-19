import { getDb } from "@/lib/db";
import { processEmailQueue } from "@/lib/email";

const CRON_SECRET = process.env.CRON_SECRET || "dev-cron-secret";

// POST /api/cron - Authenticated via Bearer token
export async function POST(req: Request) {
  // Auth via Bearer token (not cookie-based)
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const now = Date.now();
  const results: Record<string, number> = {};

  // 1. Process email queue (highest priority)
  try {
    results.emailsSent = await processEmailQueue();
  } catch (e) {
    console.error("Cron: email queue error:", e);
    results.emailsSent = 0;
  }

  // 2. Request expiration
  const timeoutHoursSetting = db
    .prepare("SELECT value FROM settings WHERE key = 'requestTimeoutHours'")
    .get() as { value: string } | undefined;
  const timeoutMs =
    parseInt(timeoutHoursSetting?.value || "48", 10) * 60 * 60 * 1000;

  const expireResult = db
    .prepare(
      `UPDATE appointments SET status = 'EXPIRED', updated_at = ?
       WHERE status = 'REQUESTED' AND created_at < ?`
    )
    .run(now, now - timeoutMs);
  results.expired = expireResult.changes;

  // 3. GDPR cleanup - Cancelled/Expired appointments
  const retentionExpiredSetting = db
    .prepare("SELECT value FROM settings WHERE key = 'retentionDaysExpired'")
    .get() as { value: string } | undefined;
  const retentionExpiredMs =
    parseInt(retentionExpiredSetting?.value || "30", 10) * 24 * 60 * 60 * 1000;

  const cleanupExpiredResult = db
    .prepare(
      `DELETE FROM appointments
       WHERE status IN ('CANCELLED', 'EXPIRED') AND created_at < ?`
    )
    .run(now - retentionExpiredMs);
  results.cleanedExpired = cleanupExpiredResult.changes;

  // 3b. GDPR cleanup - Past confirmed appointments
  const retentionPastSetting = db
    .prepare("SELECT value FROM settings WHERE key = 'retentionDaysPast'")
    .get() as { value: string } | undefined;
  const retentionPastMs =
    parseInt(retentionPastSetting?.value || "90", 10) * 24 * 60 * 60 * 1000;

  const cleanupPastResult = db
    .prepare(
      `DELETE FROM appointments
       WHERE status = 'CONFIRMED' AND end_time < ? AND end_time < ?`
    )
    .run(now, now - retentionPastMs);
  results.cleanedPast = cleanupPastResult.changes;

  // 3c. Outbox retention (SENT > 30 days, FAILED > 90 days)
  const outboxSentResult = db
    .prepare(
      `DELETE FROM email_outbox
       WHERE status = 'SENT' AND created_at < ?`
    )
    .run(now - 30 * 24 * 60 * 60 * 1000);
  results.cleanedOutboxSent = outboxSentResult.changes;

  const outboxFailedResult = db
    .prepare(
      `DELETE FROM email_outbox
       WHERE status = 'FAILED' AND created_at < ?`
    )
    .run(now - 90 * 24 * 60 * 60 * 1000);
  results.cleanedOutboxFailed = outboxFailedResult.changes;

  // 4. Login attempts cleanup (> 24h)
  const loginCleanupResult = db
    .prepare(`DELETE FROM login_attempts WHERE attempted_at < ?`)
    .run(now - 24 * 60 * 60 * 1000);
  results.cleanedLoginAttempts = loginCleanupResult.changes;

  return Response.json({ ok: true, results });
}
