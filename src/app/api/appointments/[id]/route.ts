import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { getConflictDetails, findAppointmentConflictsExcludingSeries, findBlockerConflicts, hasOverlap } from "@/lib/overlap";
import type { ConflictDetail } from "@/lib/overlap";
import { filterNotes } from "@/lib/notes-filter";
import { isValidDuration } from "@/lib/validation";
import { detectAndGroupSeries } from "@/lib/series-detect";

// GET /api/appointments/[id]
export const GET = withApiAuth(async (_req, ctx) => {
  const { id } = await ctx.params;
  const db = getDb();

  const appointment = db
    .prepare("SELECT * FROM appointments WHERE id = ?")
    .get(id);

  if (!appointment) {
    return Response.json({ error: "Termin nicht gefunden" }, { status: 404 });
  }

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

    db.prepare(
      `UPDATE appointments SET
        patient_name = COALESCE(?, patient_name),
        start_time = ?,
        end_time = ?,
        duration_minutes = ?,
        status = COALESCE(?, status),
        contact_email = COALESCE(?, contact_email),
        contact_phone = COALESCE(?, contact_phone),
        notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
        flagged_notes = CASE WHEN ? = 1 THEN ? ELSE flagged_notes END,
        reminder_sent = CASE WHEN ? = 1 THEN 0 ELSE reminder_sent END,
        updated_at = ?
      WHERE id = ?`
    ).run(
      body.patientName || null,
      newStart, newEnd, newDuration,
      body.status || null,
      body.contactEmail ?? null,
      body.contactPhone ?? null,
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

    const updateSeries = db.transaction(() => {
      // Update name, duration, contact fields
      db.prepare(
        `UPDATE appointments SET
          patient_name = COALESCE(?, patient_name),
          duration_minutes = COALESCE(?, duration_minutes),
          contact_email = COALESCE(?, contact_email),
          contact_phone = COALESCE(?, contact_phone),
          updated_at = ?
        WHERE series_id = ?`
      ).run(
        body.patientName || null,
        body.durationMinutes || null,
        body.contactEmail ?? null,
        body.contactPhone ?? null,
        now, seriesId
      );

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

      // If duration changed, recalculate endTime for all
      if (body.durationMinutes) {
        db.prepare(
          `UPDATE appointments SET
            end_time = start_time + ? * 60000,
            updated_at = ?
          WHERE series_id = ?`
        ).run(body.durationMinutes, now, seriesId);
      }
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
