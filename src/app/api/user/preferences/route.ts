import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

// GET /api/user/preferences
export const GET = withApiAuth(async (_req, _ctx, session) => {
  const db = drizzle(getDb());
  const [user] = await db
    .select({
      columnMode: adminUsers.columnMode,
      zoomLevel: adminUsers.zoomLevel,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.userId))
    .limit(1);

  return Response.json({
    columnMode: user?.columnMode || "split",
    zoomLevel: user?.zoomLevel ?? 100,
  });
});

// PATCH /api/user/preferences
export const PATCH = withApiAuth(async (req, _ctx, session) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  let body: { columnMode?: string; zoomLevel?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const updates: Record<string, string | number> = {};

  if (body.columnMode) {
    if (!["split", "single"].includes(body.columnMode)) {
      return Response.json({ error: "Ungültiger Wert" }, { status: 400 });
    }
    updates.columnMode = body.columnMode;
  }

  if (body.zoomLevel != null) {
    const z = Math.round(body.zoomLevel);
    if (z < 70 || z > 200) {
      return Response.json({ error: "Zoom muss zwischen 70 und 200 liegen" }, { status: 400 });
    }
    updates.zoomLevel = z;
  }

  if (Object.keys(updates).length > 0) {
    const db = drizzle(getDb());
    await db
      .update(adminUsers)
      .set(updates)
      .where(eq(adminUsers.id, session.userId));
  }

  return Response.json({ ok: true });
});
