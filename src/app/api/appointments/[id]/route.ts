import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { getConflictDetails, findAppointmentConflictsExcludingSeries, findBlockerConflicts, hasOverlap } from "@/lib/overlap";
import type { ConflictDetail } from "@/lib/overlap";
import { filterNotes } from "@/lib/notes-filter";
import { isValidDuration } from "@/lib/validation";
import { detectAndGroupSeries } from "@/lib/series-detect";
import { syncPatient, updatePatientContact } from "@/lib/patients";

// GET /api/appointments/[id]
export const GET = withApiAuth(async (_req, ctx) => {
  const { id } = await ctx.params;
  const db = getDb();

  const row = db
    .prepare(
      `SELECT a.*, p.email as contact_email, p.phone as contact_phone
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
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
  };

  return Response.json(appointment);
});

// PATCH /api/appointments/[id]?scope=single|future
export const PATCH = withApiAuth(async (req, ctx) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "single";

  if (scope !== "single" && scope !== "series") {
    return Response.json({ error: "scope muss 'single' oder 'series' sein" }, { status: 400 });
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM appointments WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;

  if (!existing) {
    return Response.json({ error: "Termin nicht gefunden" }, { status: 404 });
  }

  let body: {
    patientName?: string;
    startTime?: number;
    durationMinutes?: number;
    contactEmail?: string;
    contactPhone?: string;
    notes?: string;
    status?: string;
    force?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  if (body.durationMinutes && !isValidDuration(body.durationMinutes)) {
    return Response.json(
      { error: "durationMinutes muss 15, 30, 45, 60 oder 90 sein" },
      { status: 400 }
    );
  }

  // Notes filter
  if (body.notes !== undefined) {
    const notesResult = filterNotes(body.notes);
    if (!notesResult.allowed) {
      return Response.json({ error: notesResult.reason }, { status: 400 });
    }
  }

  const now = Date.now();

  if (scope === "single") {
    const newStart = body.startTime ?? (existing.start_time as number);
    const newDuration = body.durationMinutes ?? (existing.duration_minutes as number);
    const newEnd = newStart + newDuration * 60_000;

    // Overlap check if time changed
    if (!body.force && (body.startTime || body.durationMinutes)) {
      const conflictDetails = getConflictDetails(newStart, newEnd, id);
      if (conflictDetails.length > 0) {
        return Response.json(
          { error: "Zeitkonflikt: Dieser Zeitraum ist bereits belegt", conflictDetails },
          { status: 409 }
        );
      }
    }

    const notesFilter = body.notes !== undefined ? filterNotes(body.notes) : { flagged: false };

    // Resolve patient_id if name changed
    let patientId = existing.patient_id as string | null;
    if (body.patientName && body.patientName !== existing.patient_name) {
      patientId = syncPatient(body.patientName, body.contactEmail, body.contactPhone, now);
    }

    // Update contact info on patient record
    if (patientId && (body.contactEmail !== undefined || body.contactPhone !== undefined)) {
      updatePatientContact(patientId, body.contactEmail, body.contactPhone, now);
    }

    db.prepare(
      `UPDATE appointments SET
        patient_name = COALESCE(?, patient_name),
        patient_id = COALESCE(?, patient_id),
        start_time = ?,
        end_time = ?,
        duration_minutes = ?,
        status = COALESCE(?, status),
        notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
        flagged_notes = CASE WHEN ? = 1 THEN ? ELSE flagged_notes END,
        reminder_sent = CASE WHEN ? = 1 THEN 0 ELSE reminder_sent END,
        updated_at = ?
      WHERE id = ?`
    ).run(
      body.patientName || null,
      patientId,
      newStart, newEnd, newDuration,
      body.status || null,
      body.notes !== undefined ? 1 : 0, body.notes ?? null,
      body.notes !== undefined ? 1 : 0, notesFilter.flagged ? 1 : 0,
      (body.startTime || body.durationMinutes) ? 1 : 0,
      now, id
    );

    // Auto-detect series after time/patient changes
    const pName = body.patientName || (existing.patient_name as string);
    detectAndGroupSeries(pName);
    if (body.patientName && body.patientName !== existing.patient_name) {
      detectAndGroupSeries(existing.patient_name as string);
    }

    return Response.json({ ok: true });
  }

  if (scope === "series" && existing.series_id) {
    // Update all appointments in the series (single transaction)
    const seriesId = existing.series_id as string;
    const currentStart = existing.start_time as number;

    // Calculate time-of-day shift if startTime changed
    const timeDelta = body.startTime ? body.startTime - currentStart : 0;

    // Conflict check for scope=series (unless force)
    if (!body.force && (timeDelta !== 0 || body.durationMinutes)) {
      // Load all appointments in this series
      const seriesAppts = db
        .prepare(
          `SELECT id, start_time as startTime, end_time as endTime, duration_minutes as durationMinutes
           FROM appointments
           WHERE series_id = ?`
        )
        .all(seriesId) as { id: string; startTime: number; endTime: number; durationMinutes: number }[];

      // Calculate new times for each appointment
      const shifted = seriesAppts.map((a) => {
        const newStart = a.startTime + timeDelta;
        const newDuration = body.durationMinutes || a.durationMinutes;
        const newEnd = newStart + newDuration * 60_000;
        return { newStart, newEnd };
      });

      // Get the full range across all shifted appointments
      const rangeStart = Math.min(...shifted.map((s) => s.newStart));
      const rangeEnd = Math.max(...shifted.map((s) => s.newEnd));

      // Load all non-series appointments + blockers in the range (2 queries total)
      const otherAppts = findAppointmentConflictsExcludingSeries(rangeStart, rangeEnd, seriesId);
      const blockers = findBlockerConflicts(rangeStart, rangeEnd);

      // Check each shifted appointment against loaded data
      const conflictDetails: ConflictDetail[] = [];
      const seen = new Set<string>();
      for (const s of shifted) {
        for (const other of otherAppts) {
          if (hasOverlap(s.newStart, s.newEnd, other.startTime, other.endTime) && !seen.has(other.id)) {
            seen.add(other.id);
            conflictDetails.push({ name: other.name || "Unbekannt", startTime: other.startTime, endTime: other.endTime, type: "appointment" });
          }
        }
        for (const b of blockers) {
          if (hasOverlap(s.newStart, s.newEnd, b.startTime, b.endTime) && !seen.has(b.id)) {
            seen.add(b.id);
            conflictDetails.push({ name: b.name || "Blocker", startTime: b.startTime, endTime: b.endTime, type: "blocker" });
          }
        }
      }
      if (conflictDetails.length > 0) {
        return Response.json(
          { error: "Zeitkonflikt: Dieser Zeitraum ist bereits belegt", conflictDetails },
          { status: 409 }
        );
      }
    }

    let patientId = existing.patient_id as string | null;
    if (body.patientName && body.patientName !== existing.patient_name) {
      patientId = syncPatient(body.patientName, body.contactEmail, body.contactPhone, now);
    }
    if (patientId && (body.contactEmail !== undefined || body.contactPhone !== undefined)) {
      updatePatientContact(patientId, body.contactEmail, body.contactPhone, now);
    }

    const updateSeries = db.transaction(() => {
      // If time changed, shift all appointments by the same delta
      if (timeDelta !== 0) {
        db.prepare(
          `UPDATE appointments SET
            start_time = start_time + ?,
            end_time = end_time + ?,
            reminder_sent = 0,
            updated_at = ?
          WHERE series_id = ?`
        ).run(timeDelta, timeDelta, now, seriesId);
      }

      // Update name, duration on appointments
      // end_time must be updated in the same statement as duration_minutes
      // to satisfy CHECK constraint: (end_time - start_time) = duration_minutes * 60000
      db.prepare(
        `UPDATE appointments SET
          patient_name = COALESCE(?, patient_name),
          patient_id = COALESCE(?, patient_id),
          duration_minutes = COALESCE(?, duration_minutes),
          end_time = CASE WHEN ? IS NOT NULL THEN start_time + ? * 60000 ELSE end_time END,
          updated_at = ?
        WHERE series_id = ?`
      ).run(
        body.patientName || null,
        patientId,
        body.durationMinutes || null,
        body.durationMinutes || null,
        body.durationMinutes || null,
        now, seriesId
      );
    });
    updateSeries();

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Ungültiger scope" }, { status: 400 });
});

// DELETE /api/appointments/[id]?scope=single|series
export const DELETE = withApiAuth(async (req, ctx) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "single";

  if (scope !== "single" && scope !== "series") {
    return Response.json({ error: "scope muss 'single' oder 'series' sein" }, { status: 400 });
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM appointments WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;

  if (!existing) {
    return Response.json({ error: "Termin nicht gefunden" }, { status: 404 });
  }

  if (scope === "series" && existing.series_id) {
    db.prepare("DELETE FROM appointments WHERE series_id = ?").run(
      existing.series_id as string
    );
    return Response.json({ ok: true });
  }

  db.prepare("DELETE FROM appointments WHERE id = ?").run(id);
  return Response.json({ ok: true });
});
