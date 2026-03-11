import { and, gte, lt, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb, getOrmDb } from "@/lib/db";
import { appointments } from "@/lib/db/schema";
import { isValidDuration } from "@/lib/validation";
import { syncPatient } from "@/lib/patients";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { hasConflicts, createBatchConflictChecker } from "@/lib/overlap";
import { filterNotes } from "@/lib/notes-filter";

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

  const db = getOrmDb();
  const results = await db
    .select()
    .from(appointments)
    .where(and(lt(appointments.startTime, to), gte(appointments.endTime, from)));

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
    const { dayOfWeek, count, intervalWeeks } = body.series;
    const interval = intervalWeeks && [1, 2, 3, 4].includes(intervalWeeks) ? intervalWeeks : 1;
    if (count < 1 || count > 52) {
      return Response.json({ error: "Serienanzahl muss zwischen 1 und 52 liegen" }, { status: 400 });
    }

    const seriesId = uuidv4();

    // Pre-compute all slots
    const slots: { start: number; end: number }[] = [];
    let currentDate = new Date(startTime);
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        currentDate.setUTCDate(currentDate.getUTCDate() + 7 * interval);
      }
      const slotStart = currentDate.getTime();
      slots.push({ start: slotStart, end: slotStart + durationMinutes * 60_000 });
    }

    // Batch conflict check: 2 queries total instead of 2 per slot
    const rangeStart = slots[0].start;
    const rangeEnd = slots[slots.length - 1].end;
    const checkConflict = createBatchConflictChecker(rangeStart, rangeEnd);

    // Check for any conflicts first
    const conflictSlots: number[] = [];
    for (const slot of slots) {
      if (checkConflict(slot.start, slot.end)) {
        conflictSlots.push(slot.start);
      }
    }

    // If conflicts found and not force, return 409
    if (!body.force && conflictSlots.length > 0) {
      return Response.json(
        { error: `Zeitkonflikt: ${conflictSlots.length} von ${slots.length} Terminen haben Konflikte`, conflicts: conflictSlots },
        { status: 409 }
      );
    }

    const created: string[] = [];

    // All inserts in a single transaction
    const insertSeries = getDb().transaction(() => {
      for (const slot of slots) {
        const id = uuidv4();
        getDb()
          .prepare(
            `INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, series_id, contact_email, contact_phone, notes, flagged_notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            id, patientName, slot.start, slot.end, durationMinutes,
            appointmentStatus, seriesId,
            contactEmail || null, contactPhone || null,
            notes || null, notesResult.flagged ? 1 : 0,
            now, now
          );
        created.push(id);
      }
    });
    insertSeries();

    syncPatient(patientName, contactEmail, contactPhone, now);
    return Response.json({ seriesId, created }, { status: 201 });
  }

  // Single appointment
  if (!body.force && hasConflicts(startTime, endTime)) {
    return Response.json(
      { error: "Zeitkonflikt: Dieser Zeitraum ist bereits belegt" },
      { status: 409 }
    );
  }

  const id = uuidv4();
  getDb()
    .prepare(
      `INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, series_id, contact_email, contact_phone, notes, flagged_notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id, patientName, startTime, endTime, durationMinutes,
      appointmentStatus, null,
      contactEmail || null, contactPhone || null,
      notes || null, notesResult.flagged ? 1 : 0,
      now, now
    );

  syncPatient(patientName, contactEmail, contactPhone, now);
  return Response.json({ id }, { status: 201 });
});
