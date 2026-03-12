import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { escapeHtml } from "@/lib/html";
import { isValidEmail, isValidDuration } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { corsHeaders, handlePreflight } from "@/lib/cors";

// OPTIONS /api/requests (CORS preflight)
export async function OPTIONS(req: Request) {
  return handlePreflight(req) ?? new Response(null, { status: 204 });
}

// POST /api/requests - Public endpoint for patient appointment requests
export async function POST(req: Request) {
  const cors = corsHeaders(req);
  // Rate limit
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`requests:${ip}`, 10, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Zu viele Anfragen. Bitte warten Sie eine Stunde." },
      { status: 429, headers: cors }
    );
  }

  let body: {
    slotStartMs?: number;
    durationMinutes?: number;
    patientName?: string;
    contactEmail?: string;
    contactPhone?: string;
    consentGiven?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400, headers: cors });
  }

  const { slotStartMs, durationMinutes, patientName, contactEmail, contactPhone, consentGiven } = body;

  // Validation
  if (!slotStartMs || !durationMinutes || !patientName || !contactEmail || !contactPhone) {
    return Response.json(
      { error: "slotStartMs, durationMinutes, patientName, contactEmail und contactPhone sind Pflicht" },
      { status: 400, headers: cors }
    );
  }

  if (patientName.length > 100) {
    return Response.json({ error: "Name darf max. 100 Zeichen lang sein" }, { status: 400, headers: cors });
  }
  if (contactEmail.length > 100) {
    return Response.json({ error: "E-Mail darf max. 100 Zeichen lang sein" }, { status: 400, headers: cors });
  }
  if (contactPhone && contactPhone.length > 30) {
    return Response.json({ error: "Telefonnummer darf max. 30 Zeichen lang sein" }, { status: 400, headers: cors });
  }

  if (!isValidDuration(durationMinutes)) {
    return Response.json(
      { error: "durationMinutes muss 15, 30, 45, 60 oder 90 sein" },
      { status: 400, headers: cors }
    );
  }

  if (consentGiven !== true) {
    return Response.json(
      { error: "Einwilligung zur Datenverarbeitung ist erforderlich" },
      { status: 400, headers: cors }
    );
  }

  // Basic email validation
  if (!isValidEmail(contactEmail)) {
    return Response.json(
      { error: "Ungültige E-Mail-Adresse" },
      { status: 400, headers: cors }
    );
  }

  // Check if slot is in the future
  if (slotStartMs <= Date.now()) {
    return Response.json(
      { error: "Termine können nur in der Zukunft gebucht werden" },
      { status: 400, headers: cors }
    );
  }

  const db = getDb();
  const endTimeMs = slotStartMs + durationMinutes * 60_000;
  const id = uuidv4();
  const now = Date.now();

  // Atomic transaction with BEGIN IMMEDIATE for race-condition safety
  const bookSlot = db.transaction(() => {
    // Overlap-Check: Appointments
    const appointmentConflicts = db
      .prepare(
        `SELECT id FROM appointments
         WHERE status IN ('CONFIRMED', 'REQUESTED')
         AND start_time < ? AND end_time > ?`
      )
      .all(endTimeMs, slotStartMs);

    // Overlap-Check: Blockers
    const blockerConflicts = db
      .prepare(
        `SELECT id FROM blockers
         WHERE start_time < ? AND end_time > ?`
      )
      .all(endTimeMs, slotStartMs);

    if (appointmentConflicts.length > 0 || blockerConflicts.length > 0) {
      throw new Error("SLOT_TAKEN");
    }

    // INSERT with REQUESTED status
    db.prepare(
      `INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, series_id, contact_email, contact_phone, notes, flagged_notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'REQUESTED', NULL, ?, ?, NULL, 0, ?, ?)`
    ).run(id, patientName, slotStartMs, endTimeMs, durationMinutes, contactEmail, contactPhone || null, now, now);

    // Queue notification email to admin
    const adminEmailSetting = db
      .prepare("SELECT value FROM settings WHERE key = 'adminNotifyEmail'")
      .get() as { value: string } | undefined;

    if (adminEmailSetting) {
      db.prepare(
        `INSERT INTO email_outbox (id, to_address, subject, html, status, attempts, created_at)
         VALUES (?, ?, ?, ?, 'PENDING', 0, ?)`
      ).run(
        uuidv4(),
        adminEmailSetting.value,
        `Neue Terminanfrage von ${patientName.replace(/[\r\n]/g, "")}`,
        `<p>Neue Terminanfrage von <strong>${escapeHtml(patientName)}</strong></p>
         <p>E-Mail: ${escapeHtml(contactEmail)}</p>
         ${contactPhone ? `<p>Telefon: ${escapeHtml(contactPhone)}</p>` : ""}
         <p>Zeitpunkt: ${new Date(slotStartMs).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</p>
         <p>Dauer: ${durationMinutes} Minuten</p>`,
        now
      );
    }
  });

  // IMPORTANT: Use .immediate() for BEGIN IMMEDIATE
  try {
    bookSlot.immediate();
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "SLOT_TAKEN") {
      return Response.json(
        { error: "Dieser Zeitslot wurde gerade vergeben. Bitte wählen Sie einen anderen." },
        { status: 409, headers: cors }
      );
    }
    throw e;
  }

  return Response.json(
    {
      id,
      message: "Ihre Anfrage wurde gesendet. Sie erhalten eine E-Mail bei Bestätigung.",
    },
    { status: 201, headers: cors }
  );
}