import { getDb } from "@/lib/db";
import { processEmailQueue, sendEmailWithAttachment } from "@/lib/email";
import { generateArchivePdf } from "@/lib/archive";
import { queueAppointmentReminders } from "@/lib/reminders";

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

  // 1. Queue appointment reminders (before email processing)
  try {
    results.remindersQueued = queueAppointmentReminders();
  } catch (e) {
    console.error("Cron: reminders error:", e);
    results.remindersQueued = 0;
  }

  // 2. Process email queue (highest priority)
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
       WHERE status = 'CONFIRMED' AND end_time < ?`
    )
    .run(now - retentionPastMs);
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

  // 5. Auto-archive email
  results.autoArchiveSent = 0;
  try {
    const archiveSettings = db
      .prepare(`SELECT key, value FROM settings WHERE key IN ('autoArchiveEnabled', 'autoArchiveInterval', 'autoArchiveType', 'autoArchiveEmail', 'autoArchiveLastSent', 'cronJobEmail')`)
      .all() as Array<{ key: string; value: string }>;

    const archiveConfig: Record<string, string> = {};
    for (const row of archiveSettings) archiveConfig[row.key] = row.value;

    if (archiveConfig.autoArchiveEnabled === "true" && archiveConfig.autoArchiveEmail) {
      const interval = archiveConfig.autoArchiveInterval || "weekly";
      const lastSent = parseInt(archiveConfig.autoArchiveLastSent || "0", 10);

      // Berlin date components
      const berlinNow = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(now));
      const [, month, dayOfMonth] = berlinNow.split("-").map(Number);
      const berlinDow = new Date(berlinNow + "T12:00:00Z").getUTCDay(); // 0=Sun, 1=Mon

      let shouldSend = false;

      if (interval === "daily" && now - lastSent > 23 * 3600_000) {
        shouldSend = true;
      } else if (interval === "weekly" && berlinDow === 1 && now - lastSent > 6 * 24 * 3600_000) {
        shouldSend = true;
      } else if (interval === "monthly" && dayOfMonth === 1 && now - lastSent > 27 * 24 * 3600_000) {
        shouldSend = true;
      }

      if (shouldSend) {
        // Determine the date for the archive (previous period)
        const berlinDate = new Date(berlinNow + "T12:00:00Z");
        const archiveType = (archiveConfig.autoArchiveType as "week" | "month" | "year") || "week";

        // Use yesterday as reference date for all intervals
        const yesterday = new Date(berlinDate);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const archiveDate = yesterday.toISOString().split("T")[0];

        const archiveLabels: Record<string, string> = {
          week: "Wochenarchiv",
          month: "Monatsarchiv",
          year: "Jahresarchiv",
        };

        const { buffer, filename, title } = await generateArchivePdf(archiveType, archiveDate);

        // Collect recipients: autoArchiveEmail + optional cronJobEmail
        const recipients = [archiveConfig.autoArchiveEmail];
        if (archiveConfig.cronJobEmail) {
          recipients.push(archiveConfig.cronJobEmail);
        }

        let sentCount = 0;
        for (const recipient of recipients) {
          const emailResult = await sendEmailWithAttachment(
            recipient,
            title,
            `<p>Im Anhang finden Sie das ${archiveLabels[archiveType]}.</p>`,
            { filename, content: buffer }
          );

          if (emailResult.ok) {
            sentCount++;
          } else {
            console.error(`Cron: auto-archive email error (${recipient}):`, emailResult.error);
          }
        }

        if (sentCount > 0) {
          db.prepare(
            `INSERT INTO settings (key, value) VALUES ('autoArchiveLastSent', ?)
             ON CONFLICT(key) DO UPDATE SET value = ?`
          ).run(String(now), String(now));
          results.autoArchiveSent = sentCount;
        }
      }
    }
  } catch (e) {
    console.error("Cron: auto-archive error:", e);
  }

  return Response.json({ ok: true, results });
}
