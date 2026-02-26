import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

// GET /api/blockers/[id]
export const GET = withApiAuth(async (_req, ctx) => {
  const { id } = await ctx.params;
  const db = getDb();

  const blocker = db.prepare("SELECT * FROM blockers WHERE id = ?").get(id);

  if (!blocker) {
    return Response.json({ error: "Blocker nicht gefunden" }, { status: 404 });
  }

  return Response.json(blocker);
});

// DELETE /api/blockers/[id]?scope=single|group
export const DELETE = withApiAuth(async (req, ctx) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "single";

  if (scope !== "single" && scope !== "group") {
    return Response.json({ error: "scope muss 'single' oder 'group' sein" }, { status: 400 });
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM blockers WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;

  if (!existing) {
    return Response.json({ error: "Blocker nicht gefunden" }, { status: 404 });
  }

  if (scope === "group" && existing.blocker_group_id) {
    db.prepare("DELETE FROM blockers WHERE blocker_group_id = ?").run(
      existing.blocker_group_id as string
    );
    return Response.json({ ok: true });
  }

  db.prepare("DELETE FROM blockers WHERE id = ?").run(id);
  return Response.json({ ok: true });
});
