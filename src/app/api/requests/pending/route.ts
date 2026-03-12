import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";

export const GET = withApiAuth(async () => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, patient_name, contact_email, contact_phone,
              start_time, end_time, duration_minutes, created_at
       FROM appointments
       WHERE status = 'REQUESTED'
       ORDER BY created_at DESC`
    )
    .all() as Array<{
    id: string;
    patient_name: string;
    contact_email: string | null;
    contact_phone: string | null;
    start_time: number;
    end_time: number;
    duration_minutes: number;
    created_at: number;
  }>;

  const requests = rows.map((r) => ({
    id: r.id,
    patientName: r.patient_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    startTime: r.start_time,
    endTime: r.end_time,
    durationMinutes: r.duration_minutes,
    createdAt: r.created_at,
  }));

  return Response.json({ requests });
});
