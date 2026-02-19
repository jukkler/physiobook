import { drizzle } from "drizzle-orm/better-sqlite3";
import { getDb } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

// GET /api/settings
export const GET = withApiAuth(async () => {
  const db = drizzle(getDb());
  const allSettings = await db.select().from(settings);

  const result: Record<string, string> = {};
  for (const s of allSettings) {
    result[s.key] = s.value;
  }

  return Response.json(result);
});

// PATCH /api/settings
export const PATCH = withApiAuth(async (req) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const allowedKeys = [
    "morningStart",
    "morningEnd",
    "afternoonStart",
    "afternoonEnd",
    "slotDuration",
    "requestTimeoutHours",
    "retentionDaysExpired",
    "retentionDaysPast",
    "adminNotifyEmail",
  ];

  const db = getDb();

  for (const [key, value] of Object.entries(body)) {
    if (!allowedKeys.includes(key)) continue;

    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = ?`
    ).run(key, value, value);
  }

  return Response.json({ ok: true });
});
