import nodemailer from "nodemailer";
import { getDb } from "./db";

function getSmtpConfig(): { host: string; port: number; user: string; pass: string; from: string } | null {
  const db = getDb();
  const rows = db
    .prepare(`SELECT key, value FROM settings WHERE key IN ('smtpHost', 'smtpPort', 'smtpUser', 'smtpPass', 'smtpFrom')`)
    .all() as Array<{ key: string; value: string }>;

  const dbSettings: Record<string, string> = {};
  for (const row of rows) dbSettings[row.key] = row.value;

  const host = dbSettings.smtpHost || process.env.SMTP_HOST || "";
  const port = parseInt(dbSettings.smtpPort || process.env.SMTP_PORT || "587", 10);
  const user = dbSettings.smtpUser || process.env.SMTP_USER || "";
  const pass = dbSettings.smtpPass || process.env.SMTP_PASS || "";
  const from = dbSettings.smtpFrom || process.env.SMTP_FROM || user;

  if (!host || !user || !pass) return null;

  return { host, port, user, pass, from };
}

function createTransporter(config: { host: string; port: number; user: string; pass: string }): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
}

/**
 * Process pending emails from the outbox.
 * Called by cron job - not by setInterval.
 * Returns the number of emails successfully sent.
 */
export async function processEmailQueue(): Promise<number> {
  const db = getDb();
  const smtpConfig = getSmtpConfig();

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

  if (!smtpConfig) {
    console.warn(`${pending.length} emails pending but SMTP not configured.`);
    return 0;
  }

  const mailer = createTransporter(smtpConfig);
  let sent = 0;

  for (const email of pending) {
    try {
      await mailer.sendMail({
        from: smtpConfig.from,
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

/**
 * Send a test email directly (not via outbox queue).
 */
export async function sendEmailWithAttachment(
  to: string,
  subject: string,
  html: string,
  attachment: { filename: string; content: Buffer }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const smtpConfig = getSmtpConfig();
  if (!smtpConfig) {
    return { ok: false, error: "SMTP ist nicht konfiguriert" };
  }

  const mailer = createTransporter(smtpConfig);
  try {
    await mailer.sendMail({
      from: smtpConfig.from,
      to,
      subject,
      html,
      attachments: [{ filename: attachment.filename, content: attachment.content, contentType: "application/pdf" }],
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return { ok: false, error: message };
  }
}

/**
 * Send a test email directly (not via outbox queue).
 */
export async function sendTestEmail(to: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const smtpConfig = getSmtpConfig();
  if (!smtpConfig) {
    return { ok: false, error: "SMTP ist nicht konfiguriert" };
  }

  const mailer = createTransporter(smtpConfig);
  try {
    await mailer.sendMail({
      from: smtpConfig.from,
      to,
      subject: "PhysioBook — Test-E-Mail",
      html: "<p>Diese E-Mail best&auml;tigt, dass der E-Mail-Versand korrekt konfiguriert ist.</p>",
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return { ok: false, error: message };
  }
}
