import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

// POST /api/requests/[id]/reject - Idempotent
export const POST = withApiAuth(async (req, ctx) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const { id } = await ctx.params;
  const db = getDb();

  const appointment = db
    .prepare("SELECT * FROM appointments WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;

  if (!appointment) {
    return Response.json({ error: "Termin nicht gefunden" }, { status: 404 });
  }

  const status = appointment.status as string;

  // Idempotent: already cancelled
  if (status === "CANCELLED") {
    return Response.json({ ok: true, message: "Bereits abgelehnt" });
  }

  // Cannot reject a confirmed appointment (must cancel instead)
  if (status === "CONFIRMED") {
    return Response.json(
      { error: "Bereits bestätigt. Bitte stattdessen absagen." },
      { status: 409 }
    );
  }

  if (status !== "REQUESTED") {
    return Response.json(
      { error: "Anfrage nicht mehr gültig (Status: " + status + ")" },
      { status: 409 }
    );
  }

  const now = Date.now();

  db.prepare(
    "UPDATE appointments SET status = 'CANCELLED', updated_at = ? WHERE id = ?"
  ).run(now, id);

  // Queue rejection email to patient
  const contactEmail = appointment.contact_email as string | null;
  if (contactEmail) {
    const patientName = appointment.patient_name as string;
    const startTime = appointment.start_time as number;

    db.prepare(
      `INSERT INTO email_outbox (id, to_address, subject, html, status, attempts, created_at)
       VALUES (?, ?, ?, ?, 'PENDING', 0, ?)`
    ).run(
      uuidv4(),
      contactEmail,
      "Ihre Terminanfrage konnte nicht bestätigt werden",
      `<p>Hallo ${escapeHtml(patientName)},</p>
       <p>Ihre Terminanfrage für den <strong>${new Date(startTime).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</strong> konnte leider nicht bestätigt werden.</p>
       <p>Bitte versuchen Sie es mit einem anderen Zeitpunkt.</p>`,
      now
    );
  }

  return Response.json({ ok: true, message: "Anfrage abgelehnt" });
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
