import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

export const POST = withApiAuth(async (req) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  let body: {
    targetId?: string;
    sourceIds?: string[];
    name?: string;
    email?: string | null;
    phone?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const { targetId, sourceIds, name, email, phone } = body;

  if (!targetId || !sourceIds || sourceIds.length === 0 || !name?.trim()) {
    return Response.json({ error: "targetId, sourceIds und name sind Pflicht" }, { status: 400 });
  }

  if (sourceIds.includes(targetId)) {
    return Response.json({ error: "targetId darf nicht in sourceIds enthalten sein" }, { status: 400 });
  }

  const db = getDb();
  const now = Date.now();

  // Verify all patients exist
  const allIds = [targetId, ...sourceIds];
  const placeholders = allIds.map(() => "?").join(",");
  const existing = db.prepare(
    `SELECT id FROM patients WHERE id IN (${placeholders})`
  ).all(...allIds) as { id: string }[];

  if (existing.length !== allIds.length) {
    return Response.json({ error: "Nicht alle Patienten gefunden" }, { status: 404 });
  }

  const sourcePlaceholders = sourceIds.map(() => "?").join(",");

  const result = db.transaction(() => {
    // 1. Update target patient with chosen values
    db.prepare(
      `UPDATE patients SET name = ?, email = ?, phone = ?, updated_at = ? WHERE id = ?`
    ).run(name.trim(), email ?? null, phone ?? null, now, targetId);

    // 2. Move all appointments from source patients to target
    const moved = db.prepare(
      `UPDATE appointments SET patient_id = ?, patient_name = ?, updated_at = ? WHERE patient_id IN (${sourcePlaceholders})`
    ).run(targetId, name.trim(), now, ...sourceIds).changes;

    // 3. Delete source patients
    const deleted = db.prepare(
      `DELETE FROM patients WHERE id IN (${sourcePlaceholders})`
    ).run(...sourceIds).changes;

    return { movedAppointments: moved, deletedPatients: deleted };
  })();

  return Response.json({ ok: true, ...result });
});
