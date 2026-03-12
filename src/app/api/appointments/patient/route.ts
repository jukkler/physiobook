import { and, gte, eq, inArray, asc } from "drizzle-orm";
import { getOrmDb } from "@/lib/db";
import { appointments } from "@/lib/db/schema";
import { withApiAuth } from "@/lib/auth";

// GET /api/appointments/patient?name=<patientName>
// Returns all future confirmed/requested appointments for a patient
export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");

  if (!name) {
    return Response.json({ error: "name Parameter fehlt" }, { status: 400 });
  }

  const db = getOrmDb();
  const results = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.patientName, name),
        gte(appointments.startTime, Date.now()),
        inArray(appointments.status, ["CONFIRMED", "REQUESTED"])
      )
    )
    .orderBy(asc(appointments.startTime));

  return Response.json(results);
});
