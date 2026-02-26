import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
      `SELECT id, patient_name, start_time, duration_minutes, contact_email
       FROM appointments
       WHERE status = 'CONFIRMED'
         AND start_time <= ? AND start_time > ?
         AND contact_email IS NOT NULL AND contact_email != ''
         AND reminder_sent = 0`
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
      const dateStr = new Date(appt.start_time).toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      insertEmail.run(
        uuidv4(),
        appt.contact_email,
        "Erinnerung: Ihr Termin morgen",
        `<p>Hallo ${escapeHtml(appt.patient_name)},</p>
         <p>wir m&ouml;chten Sie an Ihren Termin erinnern:</p>
         <p><strong>${dateStr}</strong> (${appt.duration_minutes} Min.)</p>
         <p>Wir freuen uns auf Ihren Besuch!</p>`,
        now
      );

      markSent.run(appt.id);
    }
  });

  queueAll();

  return appointments.length;
}
