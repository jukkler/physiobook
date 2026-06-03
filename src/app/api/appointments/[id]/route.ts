import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { filterNotes } from "@/lib/notes-filter";
import { isValidDuration } from "@/lib/validation";
import { AppointmentSeriesConflictError, deleteAppointmentSeriesScope, updateAppointmentSeriesScope } from "@/lib/appointment-series";
import { normalizeSeriesScope } from "@/lib/series-rules";

// GET /api/appointments/[id]
export const GET = withApiAuth(async (_req, ctx) => {
  const { id } = await ctx.params;
  const db = getDb();

  const row = db
    .prepare(
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
       WHERE a.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!row) {
    return Response.json({ error: "Termin nicht gefunden" }, { status: 404 });
  }

  const appointment = {
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
  };

  return Response.json(appointment);
});

// PATCH /api/appointments/[id]?scope=single|future|series
export const PATCH = withApiAuth(async (req, ctx) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  let scope;
  try {
    scope = normalizeSeriesScope(url.searchParams.get("scope"));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Ungültiger scope" },
      { status: 400 }
    );
  }

  let body: {
    patientName?: string;
    startTime?: number;
    durationMinutes?: number;
    contactEmail?: string | null;
    contactPhone?: string | null;
    notes?: string;
    status?: string;
    force?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  if (body.patientName && body.patientName.length > 100) {
    return Response.json({ error: "patientName darf max. 100 Zeichen lang sein" }, { status: 400 });
  }
  if (body.contactEmail && body.contactEmail.length > 100) {
    return Response.json({ error: "contactEmail darf max. 100 Zeichen lang sein" }, { status: 400 });
  }
  if (body.contactPhone && body.contactPhone.length > 30) {
    return Response.json({ error: "contactPhone darf max. 30 Zeichen lang sein" }, { status: 400 });
  }

  if (body.durationMinutes && !isValidDuration(body.durationMinutes)) {
    return Response.json(
      { error: "durationMinutes muss 15, 30, 45, 60 oder 90 sein" },
      { status: 400 }
    );
  }

  const notesResult = body.notes !== undefined ? filterNotes(body.notes) : null;
  if (notesResult && !notesResult.allowed) {
    return Response.json({ error: notesResult.reason }, { status: 400 });
  }

  try {
    updateAppointmentSeriesScope(id, scope, {
      patientName: body.patientName,
      startTime: body.startTime,
      durationMinutes: body.durationMinutes,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      notes: body.notes,
      status: body.status,
      flaggedNotes: notesResult ? notesResult.flagged : undefined,
      force: body.force,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AppointmentSeriesConflictError) {
      return Response.json(
        { error: error.message, conflictDetails: error.conflictDetails },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : "Fehler beim Speichern";
    const statusCode = message.startsWith("Zeitkonflikt") ? 409 : message === "Termin nicht gefunden" ? 404 : 400;
    return Response.json({ error: message }, { status: statusCode });
  }
});

// DELETE /api/appointments/[id]?scope=single|future|series
export const DELETE = withApiAuth(async (req, ctx) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  let scope;
  try {
    scope = normalizeSeriesScope(url.searchParams.get("scope"));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Ungültiger scope" },
      { status: 400 }
    );
  }

  try {
    deleteAppointmentSeriesScope(id, scope);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fehler beim Löschen";
    const statusCode = message === "Termin nicht gefunden" ? 404 : 400;
    return Response.json({ error: message }, { status: statusCode });
  }
});
