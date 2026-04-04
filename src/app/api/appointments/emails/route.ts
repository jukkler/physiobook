import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";

// GET /api/appointments/emails
export const GET = withApiAuth(async () => {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT DISTINCT p.email as contact_email
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE p.email IS NOT NULL AND p.email != ''
       ORDER BY p.email`
    )
    .all() as Array<{ contact_email: string }>;

  return Response.json({ emails: rows.map((r) => r.contact_email) });
});
