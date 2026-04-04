import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";

export const GET = withApiAuth(async () => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.id, a.patient_name, p.email as contact_email, p.phone as contact_phone,
              a.start_time, a.end_time, a.duration_minutes, a.notes, a.created_at
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
       WHERE a.status = 'REQUESTED'
       ORDER BY a.created_at DESC`
    )
    .all() as Array<{
    id: string;
    patient_name: string;
    contact_email: string | null;
    contact_phone: string | null;
    start_time: number;
    end_time: number;
    duration_minutes: number;
    notes: string | null;
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
    notes: r.notes,
    createdAt: r.created_at,
  }));

  return Response.json({ requests });
});
