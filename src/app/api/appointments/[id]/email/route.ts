import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { sendAppointmentEmail } from "@/lib/appointment-email";

// POST /api/appointments/[id]/email
export const POST = withApiAuth(async (req, ctx) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const result = await sendAppointmentEmail({
    db: getDb(),
    appointmentId: id,
    subject: body.subject,
    message: body.message,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ ok: true, to: result.to });
});
