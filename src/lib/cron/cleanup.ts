// src/lib/cron/cleanup.ts
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export interface CleanupResult {
  cleanedExpired: number;
  cleanedPast: number;
  cleanedOutboxSent: number;
  cleanedOutboxFailed: number;
  cleanedLoginAttempts: number;
}

/**
 * Run all GDPR retention cleanup tasks.
 */
export function runRetentionCleanup(): CleanupResult {
  const db = getDb();
  const now = Date.now();

  const retentionExpiredMs =
    parseInt(getSetting("retentionDaysExpired"), 10) * 24 * 60 * 60 * 1000;
  const retentionPastMs =
    parseInt(getSetting("retentionDaysPast"), 10) * 24 * 60 * 60 * 1000;

  const cleanedExpired = db
    .prepare(
      `DELETE FROM appointments WHERE status IN ('CANCELLED', 'EXPIRED') AND created_at < ?`
    )
    .run(now - retentionExpiredMs).changes;

  const cleanedPast = db
    .prepare(
      `DELETE FROM appointments WHERE status = 'CONFIRMED' AND end_time < ?`
    )
    .run(now - retentionPastMs).changes;

  const cleanedOutboxSent = db
    .prepare(
      `DELETE FROM email_outbox WHERE status = 'SENT' AND created_at < ?`
    )
    .run(now - 180 * 24 * 60 * 60 * 1000).changes;

  const cleanedOutboxFailed = db
    .prepare(
      `DELETE FROM email_outbox WHERE status = 'FAILED' AND created_at < ?`
    )
    .run(now - 90 * 24 * 60 * 60 * 1000).changes;

  const cleanedLoginAttempts = db
    .prepare(`DELETE FROM login_attempts WHERE attempted_at < ?`)
    .run(now - 24 * 60 * 60 * 1000).changes;

  return { cleanedExpired, cleanedPast, cleanedOutboxSent, cleanedOutboxFailed, cleanedLoginAttempts };
}
