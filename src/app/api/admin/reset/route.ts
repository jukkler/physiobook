import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

export const POST = withApiAuth(async (req) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const db = getDb();

  const deleted = db.transaction(() => {
    const appts = db.prepare("DELETE FROM appointments").run().changes;
    const blockers = db.prepare("DELETE FROM blockers").run().changes;
    const patients = db.prepare("DELETE FROM patients").run().changes;
    const emails = db.prepare("DELETE FROM email_outbox").run().changes;
    return { appointments: appts, blockers, patients, emails };
  })();

  return Response.json({ ok: true, deleted });
});
