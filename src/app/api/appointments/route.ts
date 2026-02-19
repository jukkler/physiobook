import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, gte, lt, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { appointments } from "@/lib/db/schema";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { hasConflicts } from "@/lib/overlap";
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

  const db = drizzle(getDb());
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
    series?: { dayOfWeek: number; count: number };
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

  if (![15, 30, 45, 60].includes(durationMinutes)) {
    return Response.json(
      { error: "durationMinutes muss 15, 30, 45 oder 60 sein" },
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
    const { dayOfWeek, count } = body.series;
    if (count < 1 || count > 52) {
      return Response.json({ error: "Serienanzahl muss zwischen 1 und 52 liegen" }, { status: 400 });
    }

    const seriesId = uuidv4();
    const created: string[] = [];
    const conflicts: number[] = [];

    // Generate dates for each occurrence
    let currentDate = new Date(startTime);
    const timeOfDay = currentDate.getUTCHours() * 3600_000 +
      currentDate.getUTCMinutes() * 60_000 +
      currentDate.getUTCSeconds() * 1000;

    for (let i = 0; i < count; i++) {
      // Find next occurrence of dayOfWeek
      if (i > 0) {
        currentDate.setUTCDate(currentDate.getUTCDate() + 7);
      }

      const slotStart = currentDate.getTime();
      const slotEnd = slotStart + durationMinutes * 60_000;

      if (hasConflicts(slotStart, slotEnd)) {
        conflicts.push(slotStart);
        continue;
      }

      const id = uuidv4();
      getDb()
        .prepare(
          `INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, series_id, contact_email, contact_phone, notes, flagged_notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id, patientName, slotStart, slotEnd, durationMinutes,
          appointmentStatus, seriesId,
          contactEmail || null, contactPhone || null,
          notes || null, notesResult.flagged ? 1 : 0,
          now, now
        );
      created.push(id);
    }

    return Response.json({ seriesId, created, conflicts }, { status: 201 });
  }

  // Single appointment
  if (hasConflicts(startTime, endTime)) {
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

  return Response.json({ id }, { status: 201 });
});
