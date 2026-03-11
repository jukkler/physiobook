import { and, gte, lt } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb, getOrmDb } from "@/lib/db";
import { blockers } from "@/lib/db/schema";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { findAppointmentConflicts, hasOverlap } from "@/lib/overlap";

// GET /api/blockers?from=<epochMs>&to=<epochMs>
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
    .from(blockers)
    .where(and(lt(blockers.startTime, to), gte(blockers.endTime, from)));

  return Response.json(results);
});

// POST /api/blockers
export const POST = withApiAuth(async (req) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  let body: {
    title?: string;
    startTime?: number;
    endTime?: number;
    series?: { count: number; intervalDays: number };
    force?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const { title, startTime, endTime } = body;

  if (!title || !startTime || !endTime) {
    return Response.json(
      { error: "title, startTime und endTime sind Pflicht" },
      { status: 400 }
    );
  }

  if (endTime <= startTime) {
    return Response.json(
      { error: "endTime muss nach startTime liegen" },
      { status: 400 }
    );
  }

  const now = Date.now();

  // Series creation (e.g., daily lunch break)
  if (body.series) {
    const { count, intervalDays } = body.series;
    if (count < 1 || count > 365) {
      return Response.json({ error: "Anzahl muss zwischen 1 und 365 liegen" }, { status: 400 });
    }

    const duration = endTime - startTime;

    // Pre-compute all slots and check for conflicts
    if (!body.force) {
      const slots = Array.from({ length: count }, (_, i) => {
        const offset = i * intervalDays * 24 * 60 * 60 * 1000;
        return { start: startTime + offset, end: startTime + offset + duration };
      });
      const rangeStart = slots[0].start;
      const rangeEnd = slots[slots.length - 1].end;
      const existingAppts = findAppointmentConflicts(rangeStart, rangeEnd);

      const conflictDetails: { name: string; startTime: number; endTime: number; type: "appointment" | "blocker" }[] = [];
      const seen = new Set<string>();
      for (const slot of slots) {
        for (const a of existingAppts) {
          if (hasOverlap(slot.start, slot.end, a.startTime, a.endTime) && !seen.has(a.id)) {
            seen.add(a.id);
            conflictDetails.push({ name: a.name || "Unbekannt", startTime: a.startTime, endTime: a.endTime, type: "appointment" });
          }
        }
      }
      if (conflictDetails.length > 0) {
        return Response.json(
          { error: `Zeitkonflikt: ${conflictDetails.length} Konflikte mit bestehenden Terminen`, conflictDetails },
          { status: 409 }
        );
      }
    }

    const groupId = uuidv4();
    const created: string[] = [];

    const insertAll = getDb().transaction(() => {
      for (let i = 0; i < count; i++) {
        const offset = i * intervalDays * 24 * 60 * 60 * 1000;
        const id = uuidv4();

        getDb()
          .prepare(
            `INSERT INTO blockers (id, title, start_time, end_time, blocker_group_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(id, title, startTime + offset, startTime + offset + duration, groupId, now);

        created.push(id);
      }
    });
    insertAll();

    return Response.json({ blockerGroupId: groupId, created }, { status: 201 });
  }

  // Single blocker — conflict check
  if (!body.force) {
    const conflicts = findAppointmentConflicts(startTime, endTime);
    if (conflicts.length > 0) {
      const conflictDetails = conflicts.map((a) => ({
        name: a.name || "Unbekannt", startTime: a.startTime, endTime: a.endTime, type: "appointment" as const,
      }));
      return Response.json(
        { error: `Zeitkonflikt: ${conflicts.length} bestehende(r) Termin(e) in diesem Zeitraum`, conflictDetails },
        { status: 409 }
      );
    }
  }

  const id = uuidv4();
  getDb()
    .prepare(
      `INSERT INTO blockers (id, title, start_time, end_time, blocker_group_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, title, startTime, endTime, null, now);

  return Response.json({ id }, { status: 201 });
});
