import type Database from "better-sqlite3";
import { sendHtmlEmail as defaultSendHtmlEmail } from "@/lib/email";
import { isValidEmail } from "@/lib/validation";
import { formatBerlinDate, formatBerlinTime } from "@/lib/time";
import { renderCustomEmailWithSignature } from "@/lib/email-templates";

type SendHtmlEmail = (
  to: string,
  subject: string,
  html: string
) => Promise<{ ok: true } | { ok: false; error: string }>;

interface SendAppointmentEmailDeps {
  db: Database.Database;
  appointmentId: string;
  subject?: unknown;
  message?: unknown;
  sendHtmlEmail?: SendHtmlEmail;
  now?: () => number;
}

type SendAppointmentEmailResult =
  | { ok: true; to: string }
  | { ok: false; status: number; error: string };

interface AppointmentEmailRow {
  id: string;
  patient_name: string;
  start_time: number;
  duration_minutes: number;
  contact_email: string | null;
}

function parseEmailContent(subject: unknown, message: unknown) {
  if (typeof subject !== "string" || typeof message !== "string") {
    return { ok: false as const, error: "Betreff und Nachricht sind erforderlich" };
  }

  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();

  if (!trimmedSubject || !trimmedMessage) {
    return { ok: false as const, error: "Betreff und Nachricht dürfen nicht leer sein" };
  }

  if (trimmedSubject.length > 120) {
    return { ok: false as const, error: "Der Betreff darf maximal 120 Zeichen lang sein" };
  }

  if (trimmedMessage.length > 2000) {
    return { ok: false as const, error: "Die Nachricht darf maximal 2000 Zeichen lang sein" };
  }

  return {
    ok: true as const,
    subject: trimmedSubject,
    message: trimmedMessage,
  };
}

export async function sendAppointmentEmail({
  db,
  appointmentId,
  subject,
  message,
  sendHtmlEmail = defaultSendHtmlEmail,
}: SendAppointmentEmailDeps): Promise<SendAppointmentEmailResult> {
  const content = parseEmailContent(subject, message);
  if (!content.ok) {
    return { ok: false, status: 400, error: content.error };
  }

  const row = db
    .prepare(
      `SELECT a.id,
              a.patient_name,
              a.start_time,
              a.duration_minutes,
              p.email as contact_email
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
       WHERE a.id = ?`
    )
    .get(appointmentId) as AppointmentEmailRow | undefined;

  if (!row) {
    return { ok: false, status: 404, error: "Termin nicht gefunden" };
  }

  if (!row.contact_email) {
    return { ok: false, status: 400, error: "Für diesen Patienten ist keine E-Mail-Adresse hinterlegt" };
  }

  if (!isValidEmail(row.contact_email)) {
    return { ok: false, status: 400, error: "Für diesen Patienten ist keine gültige E-Mail-Adresse hinterlegt" };
  }

  const rendered = renderCustomEmailWithSignature(
    db,
    content.subject,
    content.message,
    {
      Name: row.patient_name,
      Datum: formatBerlinDate(row.start_time),
      Uhrzeit: formatBerlinTime(row.start_time),
      Dauer: row.duration_minutes,
    }
  );

  const result = await sendHtmlEmail(
    row.contact_email,
    rendered.subject,
    rendered.html
  );

  if (!result.ok) {
    return { ok: false, status: 500, error: result.error };
  }

  return { ok: true, to: row.contact_email };
}
