import { buildAppointmentOverviewEmail } from "@/lib/appointment-overview-email";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { getDb } from "@/lib/db";
import { sendHtmlEmail } from "@/lib/email";
import { isValidEmail } from "@/lib/validation";

interface PatientRow {
  name: string;
  email: string | null;
}

interface AppointmentRow {
  start_time: number;
  end_time: number;
  duration_minutes: number;
  status: "CONFIRMED" | "REQUESTED";
}

export const POST = withApiAuth(async (req, ctx) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const { id } = await ctx.params;
  const db = getDb();
  const patient = db
    .prepare("SELECT name, email FROM patients WHERE id = ?")
    .get(id) as PatientRow | undefined;

  if (!patient) {
    return Response.json({ error: "Patient nicht gefunden" }, { status: 404 });
  }

  const email = patient.email?.trim() || "";
  if (!email) {
    return Response.json({ error: "Keine E-Mail-Adresse hinterlegt" }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return Response.json({ error: "Ungültige E-Mail-Adresse hinterlegt" }, { status: 400 });
  }

  const rows = db
    .prepare(
      `SELECT start_time, end_time, duration_minutes, status
       FROM appointments
       WHERE patient_id = ?
         AND start_time >= ?
         AND status IN ('CONFIRMED', 'REQUESTED')
       ORDER BY start_time ASC`
    )
    .all(id, Date.now()) as AppointmentRow[];

  if (rows.length === 0) {
    return Response.json({ error: "Keine zukünftigen Termine gefunden" }, { status: 404 });
  }

  const message = buildAppointmentOverviewEmail(
    patient.name,
    rows.map((row) => ({
      startTime: row.start_time,
      endTime: row.end_time,
      durationMinutes: row.duration_minutes,
      status: row.status,
    }))
  );
  const result = await sendHtmlEmail(email, message.subject, message.html);

  if (!result.ok) {
    console.error(`Terminübersicht konnte nicht an Patient ${id} gesendet werden:`, result.error);
    return Response.json(
      { error: "E-Mail konnte nicht gesendet werden. Bitte SMTP-Einstellungen prüfen." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, email, appointmentCount: rows.length });
});
