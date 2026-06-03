import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { formatBerlinDate, formatBerlinTime } from "@/lib/time";
import { renderReminderEmail } from "@/lib/email-templates";

/**
 * Queue reminder emails for confirmed appointments starting within 24 hours.
 * Called by cron job before processEmailQueue().
 * Returns the number of reminders queued.
 */
export function queueAppointmentReminders(): number {
  const db = getDb();

  // Check if reminders are enabled
  const setting = db
    .prepare("SELECT value FROM settings WHERE key = 'reminderNotificationsEnabled'")
    .get() as { value: string } | undefined;

  if (setting?.value !== "true") return 0;

  const now = Date.now();
  const in24h = now + 24 * 60 * 60 * 1000;

  // Find appointments needing reminders
  const appointments = db
    .prepare(
      `SELECT a.id, a.patient_name, a.start_time, a.duration_minutes, p.email as contact_email
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.status = 'CONFIRMED'
         AND a.start_time <= ? AND a.start_time > ?
         AND p.email IS NOT NULL AND p.email != ''
         AND a.reminder_sent = 0`
    )
    .all(in24h, now) as Array<{
    id: string;
    patient_name: string;
    start_time: number;
    duration_minutes: number;
    contact_email: string;
  }>;

  if (appointments.length === 0) return 0;

  const insertEmail = db.prepare(
    `INSERT INTO email_outbox (id, to_address, subject, html, status, attempts, created_at)
     VALUES (?, ?, ?, ?, 'PENDING', 0, ?)`
  );

  const markSent = db.prepare(
    `UPDATE appointments SET reminder_sent = 1 WHERE id = ?`
  );

  const queueAll = db.transaction(() => {
    for (const appt of appointments) {
      const rendered = renderReminderEmail(db, {
        Name: appt.patient_name,
        Datum: formatBerlinDate(appt.start_time),
        Uhrzeit: formatBerlinTime(appt.start_time),
        Dauer: appt.duration_minutes,
      });

      insertEmail.run(
        uuidv4(),
        appt.contact_email,
        rendered.subject,
        rendered.html,
        now
      );

      markSent.run(appt.id);
    }
  });

  queueAll();

  return appointments.length;
}
