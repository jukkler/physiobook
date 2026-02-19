import { getDb } from "@/lib/db";

export async function GET() {
  let dbOk = false;
  try {
    const db = getDb();
    const result = db.prepare("SELECT 1 as ok").get() as { ok: number } | undefined;
    dbOk = result?.ok === 1;
  } catch {
    dbOk = false;
  }

  return Response.json({
    status: dbOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    dbOk,
  });
}
