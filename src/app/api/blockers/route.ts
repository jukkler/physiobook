import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, gte, lt } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { blockers } from "@/lib/db/schema";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

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

  const db = drizzle(getDb());
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

    const groupId = uuidv4();
    const duration = endTime - startTime;
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

  // Single blocker
  const id = uuidv4();
  getDb()
    .prepare(
      `INSERT INTO blockers (id, title, start_time, end_time, blocker_group_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, title, startTime, endTime, null, now);

  return Response.json({ id }, { status: 201 });
});
