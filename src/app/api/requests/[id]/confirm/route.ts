import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { escapeHtml } from "@/lib/html";

// POST /api/requests/[id]/confirm - Idempotent
export const POST = withApiAuth(async (req, ctx) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const { id } = await ctx.params;
  const db = getDb();

  const appointment = db
    .prepare(
      `SELECT a.*, p.email as contact_email, p.phone as contact_phone
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
       WHERE a.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!appointment) {
    return Response.json({ error: "Termin nicht gefunden" }, { status: 404 });
  }

  const status = appointment.status as string;

  // Idempotent: already confirmed
  if (status === "CONFIRMED") {
    return Response.json({ ok: true, message: "Bereits bestätigt" });
  }

  // Can only confirm REQUESTED
  if (status !== "REQUESTED") {
    return Response.json(
      { error: "Anfrage nicht mehr gültig (Status: " + status + ")" },
      { status: 409 }
    );
  }

  const now = Date.now();

  db.prepare(
    "UPDATE appointments SET status = 'CONFIRMED', updated_at = ? WHERE id = ?"
  ).run(now, id);

  // Queue confirmation email to patient
  const contactEmail = appointment.contact_email as string | null;
  if (contactEmail) {
    const startTime = appointment.start_time as number;
    const durationMinutes = appointment.duration_minutes as number;
    const patientName = appointment.patient_name as string;

    db.prepare(
      `INSERT INTO email_outbox (id, to_address, subject, html, status, attempts, created_at)
       VALUES (?, ?, ?, ?, 'PENDING', 0, ?)`
    ).run(
      uuidv4(),
      contactEmail,
      "Ihr Termin wurde bestätigt",
      `<p>Hallo ${escapeHtml(patientName)},</p>
       <p>Ihr Termin am <strong>${new Date(startTime).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</strong> (${durationMinutes} Min.) wurde bestätigt.</p>
       <p>Wir freuen uns auf Ihren Besuch!</p>`,
      now
    );
  }

  return Response.json({ ok: true, message: "Termin bestätigt" });
});