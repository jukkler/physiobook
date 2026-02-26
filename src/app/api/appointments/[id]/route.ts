import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { hasConflicts } from "@/lib/overlap";
import { filterNotes } from "@/lib/notes-filter";

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

  if (scope !== "single" && scope !== "future") {
    return Response.json({ error: "scope muss 'single' oder 'future' sein" }, { status: 400 });
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
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  if (body.durationMinutes && ![15, 30, 45, 60].includes(body.durationMinutes)) {
    return Response.json(
      { error: "durationMinutes muss 15, 30, 45 oder 60 sein" },
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
    if (body.startTime || body.durationMinutes) {
      if (hasConflicts(newStart, newEnd, id)) {
        return Response.json(
          { error: "Zeitkonflikt: Dieser Zeitraum ist bereits belegt" },
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
      now, id
    );

    return Response.json({ ok: true });
  }

  if (scope === "future" && existing.series_id) {
    // Update all future appointments in the series (single transaction)
    const seriesId = existing.series_id as string;
    const currentStart = existing.start_time as number;

    const updateFuture = db.transaction(() => {
      db.prepare(
        `UPDATE appointments SET
          patient_name = COALESCE(?, patient_name),
          duration_minutes = COALESCE(?, duration_minutes),
          contact_email = COALESCE(?, contact_email),
          contact_phone = COALESCE(?, contact_phone),
          updated_at = ?
        WHERE series_id = ? AND start_time >= ?`
      ).run(
        body.patientName || null,
        body.durationMinutes || null,
        body.contactEmail ?? null,
        body.contactPhone ?? null,
        now, seriesId, currentStart
      );

      // If duration changed, update endTime for all affected
      if (body.durationMinutes) {
        db.prepare(
          `UPDATE appointments SET
            end_time = start_time + ? * 60000,
            updated_at = ?
          WHERE series_id = ? AND start_time >= ?`
        ).run(body.durationMinutes, now, seriesId, currentStart);
      }
    });
    updateFuture();

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
