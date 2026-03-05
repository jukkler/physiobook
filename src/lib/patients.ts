// src/lib/patients.ts
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";

/**
 * Upsert a patient record by name (case-insensitive).
 * Creates if not exists. Updates email/phone only if currently empty.
 */
export function syncPatient(
  name: string,
  email?: string | null,
  phone?: string | null,
  now: number = Date.now()
): void {
  const db = getDb();

  const existing = db
    .prepare("SELECT id, email, phone FROM patients WHERE name = ? COLLATE NOCASE")
    .get(name) as { id: string; email: string | null; phone: string | null } | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO patients (id, name, email, phone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), name, email ?? null, phone ?? null, now, now);
    return;
  }

  const newEmail = !existing.email && email ? email : existing.email;
  const newPhone = !existing.phone && phone ? phone : existing.phone;

  if (newEmail !== existing.email || newPhone !== existing.phone) {
    db.prepare("UPDATE patients SET email = ?, phone = ?, updated_at = ? WHERE id = ?")
      .run(newEmail, newPhone, now, existing.id);
  }
}
