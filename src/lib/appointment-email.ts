import type Database from "better-sqlite3";
import { escapeHtml } from "@/lib/html";
import { formatBerlinDate, formatBerlinTime } from "@/lib/time";
import { sendHtmlEmail as defaultSendHtmlEmail } from "@/lib/email";

type SendHtmlEmail = (
  to: string,
  subject: string,
  html: string
) => Promise<{ ok: true } | { ok: false; error: string }>;

interface SendAppointmentEmailDeps {
  db: Database.Database;
  appointmentId: string;
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
  end_time: number;
  duration_minutes: number;
  status: string;
  notes: string | null;
  contact_email: string | null;
}

function buildAppointmentEmailHtml(row: AppointmentEmailRow): string {
  const date = formatBerlinDate(row.start_time);
  const start = formatBerlinTime(row.start_time);
  const end = formatBerlinTime(row.end_time);
  const notes = row.notes?.trim()
    ? `<p><strong>Hinweis:</strong> ${escapeHtml(row.notes.trim())}</p>`
    : "";

  return `<p>Hallo ${escapeHtml(row.patient_name)},</p>
<p>hiermit senden wir Ihnen Ihre Termininformation:</p>
<p><strong>${date}</strong><br>${start} - ${end} Uhr<br>${row.duration_minutes} Minuten</p>
${notes}
<p>Falls Sie den Termin nicht wahrnehmen k&ouml;nnen, melden Sie sich bitte rechtzeitig in der Praxis.</p>`;
}

export async function sendAppointmentEmail({
  db,
  appointmentId,
  sendHtmlEmail = defaultSendHtmlEmail,
}: SendAppointmentEmailDeps): Promise<SendAppointmentEmailResult> {
  const row = db
    .prepare(
      `SELECT a.id,
              a.patient_name,
              a.start_time,
              a.end_time,
              a.duration_minutes,
              a.status,
              a.notes,
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

  const result = await sendHtmlEmail(
    row.contact_email,
    "Ihr Termin in der Praxis",
    buildAppointmentEmailHtml(row)
  );

  if (!result.ok) {
    return { ok: false, status: 500, error: result.error };
  }

  return { ok: true, to: row.contact_email };
}
