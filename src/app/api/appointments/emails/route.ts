import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";

// GET /api/appointments/emails
export const GET = withApiAuth(async () => {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT DISTINCT contact_email
       FROM appointments
       WHERE contact_email IS NOT NULL AND contact_email != ''
       ORDER BY contact_email`
    )
    .all() as Array<{ contact_email: string }>;

  return Response.json({ emails: rows.map((r) => r.contact_email) });
});
