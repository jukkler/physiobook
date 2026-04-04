import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { dateTimeToEpoch } from "@/lib/time";
import { syncPatient } from "@/lib/patients";

const STATUS_MAP: Record<string, string> = {
  "bestätigt": "CONFIRMED",
  "angefragt": "REQUESTED",
  "abgesagt": "CANCELLED",
  "abgelaufen": "EXPIRED",
};

// Parse "Mo., 09.03.2026" → "2026-03-09"
function parseDateHeader(line: string): string | null {
  const m = line.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function cleanField(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed || trimmed === "–" || trimmed === "-") return null;
  return trimmed;
}

// Regex for appointment lines in the concatenated PDF text format:
// "08:00–09:30Esgen90 minBestätigt––"
// Uses non-greedy match for patient name, then specific valid duration, then status
const APPOINTMENT_RE = /^(\d{2}:\d{2})[–-](\d{2}:\d{2})(.+?)(15|30|45|60|90) min(Bestätigt|Angefragt|Abgesagt|Abgelaufen)(.*)$/;

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

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "Nur PDF-Dateien erlaubt" }, { status: 400 });
  }

  // Parse PDF
  let pdfText: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    pdfText = data.text;
  } catch (err) {
    console.error("PDF parse error:", err);
    return Response.json({ error: "PDF konnte nicht gelesen werden: " + String(err) }, { status: 400 });
  }

  // Debug mode: return raw text for inspection
  const debug = formData.get("debug") === "1";
  if (debug) {
    return Response.json({ rawText: pdfText.substring(0, 3000), lineCount: pdfText.split(/\n/).length });
  }

  // Parse lines
  const lines = pdfText.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const db = getDb();
  const now = Date.now();
  const errors: string[] = [];
  let imported = 0;

  // Collect all appointments to insert
  const appointments: {
    patientName: string;
    startTime: number;
    durationMinutes: number;
    status: string;
    contactPhone: string | null;
    contactEmail: string | null;
    notes: string | null;
  }[] = [];

  let currentDate: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip non-data lines
    if (/^Terminarchiv/i.test(line)) continue;
    if (/^Erstellt am/i.test(line)) continue;
    if (/^UhrzeitPatient/i.test(line)) continue;

    // Try to parse as date header (e.g. "Mo., 09.03.2026")
    if (/^[A-Za-zÄÖÜäöü]{2,3}\.,?\s*\d{2}\.\d{2}\.\d{4}/.test(line)) {
      const dateStr = parseDateHeader(line);
      if (dateStr) {
        currentDate = dateStr;
        continue;
      }
    }

    if (!currentDate) continue;

    // Try to parse as appointment row
    // PDF text is concatenated: "08:00–09:30Esgen90 minBestätigt––"
    const match = line.match(APPOINTMENT_RE);
    if (!match) continue;

    const startTimeStr = match[1];
    const patientName = match[3].trim();
    const durationMinutes = parseInt(match[4], 10);
    const statusStr = match[5];
    const afterStatus = match[6];

    if (!patientName) {
      errors.push(`Zeile ${i + 1}: Kein Patientenname`);
      continue;
    }

    const status = STATUS_MAP[statusStr.toLowerCase()] || "CONFIRMED";

    // After status: contact and notes separated by en-dash
    // e.g. "––" (both empty), "02196 5869–" (phone, no notes)
    const contactNoteParts = afterStatus.split("–");
    const contactRaw = cleanField(contactNoteParts[0] || "");
    const notesRaw = cleanField(contactNoteParts.slice(1).join("–"));

    // Determine if contact is email or phone
    let contactEmail: string | null = null;
    let contactPhone: string | null = null;
    if (contactRaw) {
      if (contactRaw.includes("@")) {
        contactEmail = contactRaw;
      } else {
        contactPhone = contactRaw;
      }
    }

    const startTime = dateTimeToEpoch(currentDate, startTimeStr);

    appointments.push({
      patientName,
      startTime,
      durationMinutes,
      status,
      contactEmail,
      contactPhone,
      notes: notesRaw,
    });
  }

  if (appointments.length === 0) {
    return Response.json(
      { error: "Keine Termine in der PDF gefunden", errors },
      { status: 400 }
    );
  }

  // Bulk insert in transaction
  const insertStmt = db.prepare(
    `INSERT INTO appointments (id, patient_name, patient_id, start_time, end_time, duration_minutes, status, series_id, notes, flagged_notes, reminder_sent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const importAll = db.transaction(() => {
    for (const apt of appointments) {
      const endTime = apt.startTime + apt.durationMinutes * 60_000;
      const patientId = syncPatient(apt.patientName, apt.contactEmail, apt.contactPhone, now);
      insertStmt.run(
        uuidv4(),
        apt.patientName,
        patientId,
        apt.startTime,
        endTime,
        apt.durationMinutes,
        apt.status,
        null, // series_id
        apt.notes,
        0, // flagged_notes
        0, // reminder_sent
        now,
        now
      );
      imported++;
    }
  });

  importAll();

  return Response.json({ imported, errors });
});
