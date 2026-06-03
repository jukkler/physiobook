import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { isValidDuration } from "@/lib/validation";
import { syncPatient } from "@/lib/patients";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { getConflictDetails } from "@/lib/overlap";
import { filterNotes } from "@/lib/notes-filter";
import { detectAndGroupSeries } from "@/lib/series-detect";
import { createAppointmentSeries } from "@/lib/appointment-series";

// GET /api/appointments?from=<epochMs>&to=<epochMs>
export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));

  if (!from || !to || to <= from) {
    return Response.json(
      { error: "Ungültige Zeitraum-Parameter (from, to als epoch ms)" },
      { status: 400 }
    );
  }

  const db = getDb();
  const rows = db.prepare(
    `SELECT
       a.*,
       p.email as contact_email,
       p.phone as contact_phone,
       s.interval_weeks as series_interval_weeks,
       s.occurrence_count as series_occurrence_count,
       s.first_start_time as series_first_start_time,
       s.last_start_time as series_last_start_time
     FROM appointments a
     LEFT JOIN patients p ON p.id = a.patient_id
     LEFT JOIN appointment_series s ON s.id = a.series_id
     WHERE a.start_time < ? AND a.end_time >= ?`
  ).all(to, from) as Record<string, unknown>[];

  const results = rows.map((row) => ({
    id: row.id,
    patientName: row.patient_name,
    patientId: row.patient_id,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes,
    status: row.status,
    seriesId: row.series_id,
    notes: row.notes,
    flaggedNotes: row.flagged_notes,
    reminderSent: row.reminder_sent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    seriesOccurrenceIndex: row.series_occurrence_index,
    seriesOriginalStartTime: row.series_original_start_time,
    seriesExceptionType: row.series_exception_type,
    seriesSummary: row.series_id
      ? {
          id: row.series_id,
          intervalWeeks: row.series_interval_weeks,
          occurrenceCount: row.series_occurrence_count,
          firstStartTime: row.series_first_start_time,
          lastStartTime: row.series_last_start_time,
          occurrenceIndex: row.series_occurrence_index,
          exceptionType: row.series_exception_type,
        }
      : null,
  }));

  return Response.json(results);
});

// POST /api/appointments
export const POST = withApiAuth(async (req) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  let body: {
    patientName?: string;
    startTime?: number;
    durationMinutes?: number;
    contactEmail?: string;
    contactPhone?: string;
    notes?: string;
    status?: string;
    series?: { dayOfWeek: number; count: number; intervalWeeks?: number };
    force?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const { patientName, startTime, durationMinutes, contactEmail, contactPhone, notes, status } = body;

  // Validation
  if (!patientName || !startTime || !durationMinutes) {
    return Response.json(
      { error: "patientName, startTime und durationMinutes sind Pflicht" },
      { status: 400 }
    );
  }

  if (patientName.length > 100) {
    return Response.json({ error: "patientName darf max. 100 Zeichen lang sein" }, { status: 400 });
  }
  if (contactEmail && contactEmail.length > 100) {
    return Response.json({ error: "contactEmail darf max. 100 Zeichen lang sein" }, { status: 400 });
  }
  if (contactPhone && contactPhone.length > 30) {
    return Response.json({ error: "contactPhone darf max. 30 Zeichen lang sein" }, { status: 400 });
  }

  if (!isValidDuration(durationMinutes)) {
    return Response.json(
      { error: "durationMinutes muss 15, 30, 45, 60 oder 90 sein" },
      { status: 400 }
    );
  }

  // Notes filter
  const notesResult = filterNotes(notes);
  if (!notesResult.allowed) {
    return Response.json({ error: notesResult.reason }, { status: 400 });
  }

  const endTime = startTime + durationMinutes * 60_000;
  const now = Date.now();
  const appointmentStatus = status || "CONFIRMED";

  // Series creation
  if (body.series) {
    const { count, intervalWeeks } = body.series;
    const interval = intervalWeeks && [1, 2, 3, 4].includes(intervalWeeks) ? intervalWeeks : 1;
    try {
      const result = createAppointmentSeries({
        patientName,
        contactEmail,
        contactPhone,
        startTime,
        durationMinutes,
        status: appointmentStatus,
        notes: notes || null,
        flaggedNotes: notesResult.flagged,
        intervalWeeks: interval,
        count,
        force: body.force,
      });
      return Response.json(result, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fehler beim Erstellen der Serie";
      const statusCode = message.startsWith("Zeitkonflikt") ? 409 : 400;
      return Response.json({ error: message }, { status: statusCode });
    }
  }

  // Single appointment
  if (!body.force) {
    const conflictDetails = getConflictDetails(startTime, endTime);
    if (conflictDetails.length > 0) {
      return Response.json(
        { error: "Zeitkonflikt: Dieser Zeitraum ist bereits belegt", conflictDetails },
        { status: 409 }
      );
    }
  }

  const patientId = syncPatient(patientName, contactEmail, contactPhone, now);

  const id = uuidv4();
  getDb()
    .prepare(
      `INSERT INTO appointments (id, patient_name, patient_id, start_time, end_time, duration_minutes, status, series_id, notes, flagged_notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, patientName, patientId, startTime, endTime, durationMinutes,
      appointmentStatus, null,
      notes || null, notesResult.flagged ? 1 : 0,
      now, now
    );

  detectAndGroupSeries(patientName);
  return Response.json({ id }, { status: 201 });
});
