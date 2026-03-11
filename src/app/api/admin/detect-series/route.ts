import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { detectAllSeries } from "@/lib/series-detect";

// POST /api/admin/detect-series
// One-time migration: detect and group series for all existing appointments
export const POST = withApiAuth(async (req) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  const result = detectAllSeries();
  return Response.json(result);
});
