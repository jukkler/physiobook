import nodemailer from "nodemailer";
import { getDb } from "./db";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("SMTP not configured. Emails will not be sent.");
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

/**
 * Process pending emails from the outbox.
 * Called by cron job - not by setInterval.
 * Returns the number of emails successfully sent.
 */
export async function processEmailQueue(): Promise<number> {
  const db = getDb();
  const mailer = getTransporter();

  // Load pending emails (max 10 per batch, oldest first)
  const pending = db
    .prepare(
      `SELECT * FROM email_outbox
       WHERE status = 'PENDING' AND attempts < 3
       ORDER BY created_at ASC LIMIT 10`
    )
    .all() as Array<{
    id: string;
    to_address: string;
    subject: string;
    html: string;
    attempts: number;
  }>;

  if (pending.length === 0) return 0;

  if (!mailer) {
    console.warn(`${pending.length} emails pending but SMTP not configured.`);
    return 0;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  let sent = 0;

  for (const email of pending) {
    try {
      await mailer.sendMail({
        from,
        to: email.to_address,
        subject: email.subject,
        html: email.html,
      });

      db.prepare(
        `UPDATE email_outbox SET status = 'SENT', sent_at = ? WHERE id = ?`
      ).run(Date.now(), email.id);

      sent++;
    } catch (err) {
      console.error(`Failed to send email ${email.id}:`, err);

      const newAttempts = email.attempts + 1;
      const newStatus = newAttempts >= 3 ? "FAILED" : "PENDING";

      db.prepare(
        `UPDATE email_outbox SET status = ?, attempts = ? WHERE id = ?`
      ).run(newStatus, newAttempts, email.id);
    }
  }

  return sent;
}
