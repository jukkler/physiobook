import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

// GET /api/patients?q=...
export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const db = getDb();

  let rows;
  if (q) {
    rows = db
      .prepare(
        `SELECT id, name, email, phone FROM patients
         WHERE name LIKE ? COLLATE NOCASE
         ORDER BY name COLLATE NOCASE LIMIT 50`
      )
      .all(`%${q}%`);
  } else {
    rows = db
      .prepare(
        `SELECT id, name, email, phone FROM patients
         ORDER BY name COLLATE NOCASE`
      )
      .all();
  }

  return Response.json({ patients: rows });
});

// POST /api/patients
export const POST = withApiAuth(async (req) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  let body: { name?: string; email?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name || name.length > 100) {
    return Response.json({ error: "Name ist erforderlich (max. 100 Zeichen)" }, { status: 400 });
  }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return Response.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
  }

  const db = getDb();
  const now = Date.now();
  const id = uuidv4();

  db.prepare(
    `INSERT INTO patients (id, name, email, phone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, name, body.email || null, body.phone || null, now, now);

  return Response.json({ id }, { status: 201 });
});
