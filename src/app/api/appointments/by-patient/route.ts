import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";

export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const patientId = url.searchParams.get("id");

  if (!patientId) {
    return Response.json({ error: "id Parameter fehlt" }, { status: 400 });
  }

  const db = getDb();

  // Get patient info
  const patient = db.prepare(
    "SELECT id, name, email, phone FROM patients WHERE id = ?"
  ).get(patientId) as { id: string; name: string; email: string | null; phone: string | null } | undefined;

  if (!patient) {
    return Response.json({ error: "Patient nicht gefunden" }, { status: 404 });
  }

  // Get all appointments for this patient
  const rows = db.prepare(
    `SELECT id, patient_name, patient_id, start_time, end_time, duration_minutes,
            status, series_id, notes, flagged_notes, reminder_sent, created_at, updated_at
     FROM appointments
     WHERE patient_id = ?
     ORDER BY start_time DESC`
  ).all(patientId) as Array<Record<string, unknown>>;

  const appointments = rows.map((r) => ({
    id: r.id,
    patientName: r.patient_name,
    patientId: r.patient_id,
    startTime: r.start_time,
    endTime: r.end_time,
    durationMinutes: r.duration_minutes,
    status: r.status,
    seriesId: r.series_id,
    notes: r.notes,
    flaggedNotes: r.flagged_notes,
    reminderSent: r.reminder_sent,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return Response.json({ patient, appointments });
});
