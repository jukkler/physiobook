// src/lib/patients.ts
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";

/**
 * Upsert a patient record by name (case-insensitive).
 * Creates if not exists. Updates email/phone only if currently empty.
 * Returns the patient ID.
 */
export function syncPatient(
  name: string,
  email?: string | null,
  phone?: string | null,
  now: number = Date.now()
): string {
  const db = getDb();

  const existing = db
    .prepare("SELECT id, email, phone FROM patients WHERE name = ? COLLATE NOCASE")
    .get(name) as { id: string; email: string | null; phone: string | null } | undefined;

  if (!existing) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO patients (id, name, email, phone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, name, email ?? null, phone ?? null, now, now);
    return id;
  }

  const newEmail = !existing.email && email ? email : existing.email;
  const newPhone = !existing.phone && phone ? phone : existing.phone;

  if (newEmail !== existing.email || newPhone !== existing.phone) {
    db.prepare("UPDATE patients SET email = ?, phone = ?, updated_at = ? WHERE id = ?")
      .run(newEmail, newPhone, now, existing.id);
  }

  return existing.id;
}

/**
 * Update a patient's contact info (always overwrites).
 * Used when admin explicitly edits contact fields on an appointment.
 */
export function updatePatientContact(
  patientId: string,
  email?: string | null,
  phone?: string | null,
  now: number = Date.now()
): void {
  const db = getDb();
  db.prepare(
    `UPDATE patients SET
      email = CASE WHEN ? = 1 THEN ? ELSE email END,
      phone = CASE WHEN ? = 1 THEN ? ELSE phone END,
      updated_at = ?
    WHERE id = ?`
  ).run(
    email !== undefined ? 1 : 0, email ?? null,
    phone !== undefined ? 1 : 0, phone ?? null,
    now, patientId
  );
}

/**
 * Get patient by ID.
 */
export function getPatient(id: string): { id: string; name: string; email: string | null; phone: string | null } | undefined {
  const db = getDb();
  return db
    .prepare("SELECT id, name, email, phone FROM patients WHERE id = ?")
    .get(id) as { id: string; name: string; email: string | null; phone: string | null } | undefined;
}
