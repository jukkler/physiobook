import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

export const POST = withApiAuth(async (req) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return Response.json({ error: "Keine Datei hochgeladen" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return Response.json({ error: "Nur CSV-Dateien erlaubt" }, { status: 400 });
  }

  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return Response.json({ error: "CSV enthält keine Daten (nur Header oder leer)" }, { status: 400 });
  }

  // Skip header line
  const dataLines = lines.slice(1);

  const db = getDb();
  const now = Date.now();
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  const existingCheck = db.prepare(
    "SELECT id FROM patients WHERE name = ? COLLATE NOCASE"
  );
  const insertStmt = db.prepare(
    `INSERT INTO patients (id, name, email, phone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const importAll = db.transaction(() => {
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      // Support both comma and semicolon as delimiter
      const delimiter = line.includes(";") ? ";" : ",";
      const parts = line.split(delimiter).map((p) => p.trim());

      const nachname = parts[0] || "";
      const vorname = parts[1] || "";
      const phone = parts[2] || null;
      const email = parts[3] || null;

      // Build full name: "Vorname Nachname"
      const name = vorname
        ? `${vorname} ${nachname}`.trim()
        : nachname.trim();

      if (!name) {
        errors.push(`Zeile ${i + 2}: Kein Name`);
        continue;
      }

      if (name.length > 100) {
        errors.push(`Zeile ${i + 2}: Name zu lang (max. 100 Zeichen)`);
        continue;
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`Zeile ${i + 2}: Ungültige E-Mail "${email}"`);
        continue;
      }

      // Check for duplicates
      const existing = existingCheck.get(name);
      if (existing) {
        skipped++;
        continue;
      }

      insertStmt.run(uuidv4(), name, email || null, phone || null, now, now);
      imported++;
    }
  });

  importAll();

  return Response.json({ imported, skipped, errors });
});
