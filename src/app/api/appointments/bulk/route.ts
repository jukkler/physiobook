import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

export const DELETE = withApiAuth(async (req) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const url = new URL(req.url);
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));

  if (!from || !to || to <= from) {
    return Response.json(
      { error: "Ungültige Zeitraum-Parameter (from, to als epoch ms)" },
      { status: 400 }
    );
  }

  const db = getDb();
  const result = db
    .prepare("DELETE FROM appointments WHERE start_time >= ? AND start_time < ?")
    .run(from, to);

  return Response.json({ deleted: result.changes });
});
