import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

// PATCH /api/patients/[id]
export const PATCH = withApiAuth(async (req, ctx) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const { id } = await ctx.params;
  const db = getDb();

  const existing = db.prepare("SELECT id FROM patients WHERE id = ?").get(id);
  if (!existing) {
    return Response.json({ error: "Patient nicht gefunden" }, { status: 404 });
  }

  let body: { name?: string; email?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  if (body.name !== undefined && (!body.name.trim() || body.name.length > 100)) {
    return Response.json({ error: "Name darf nicht leer sein (max. 100 Zeichen)" }, { status: 400 });
  }

  if (body.email !== undefined && body.email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return Response.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
  }

  const now = Date.now();

  db.prepare(
    `UPDATE patients SET
      name = COALESCE(?, name),
      email = CASE WHEN ? = 1 THEN ? ELSE email END,
      phone = CASE WHEN ? = 1 THEN ? ELSE phone END,
      updated_at = ?
    WHERE id = ?`
  ).run(
    body.name?.trim() || null,
    body.email !== undefined ? 1 : 0, body.email ?? null,
    body.phone !== undefined ? 1 : 0, body.phone ?? null,
    now, id
  );

  return Response.json({ ok: true });
});

// DELETE /api/patients/[id]
export const DELETE = withApiAuth(async (req, ctx) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const { id } = await ctx.params;
  const db = getDb();

  const result = db.prepare("DELETE FROM patients WHERE id = ?").run(id);
  if (result.changes === 0) {
    return Response.json({ error: "Patient nicht gefunden" }, { status: 404 });
  }

  return Response.json({ ok: true });
});
