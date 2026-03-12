// src/app/api/cron/route.ts
import { processEmailQueue } from "@/lib/email";
import { queueAppointmentReminders } from "@/lib/reminders";
import { expireTimedOutRequests } from "@/lib/cron/expire";
import { runRetentionCleanup } from "@/lib/cron/cleanup";
import { runAutoArchive } from "@/lib/cron/auto-archive";

const CRON_SECRET = process.env.CRON_SECRET!;

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, number> = {};

  try { results.remindersQueued = queueAppointmentReminders(); }
  catch (e) { console.error("Cron: reminders error:", e); results.remindersQueued = 0; }

  try { results.emailsSent = await processEmailQueue(); }
  catch (e) { console.error("Cron: email queue error:", e); results.emailsSent = 0; }

  try { results.expired = expireTimedOutRequests(); }
  catch (e) { console.error("Cron: expire error:", e); results.expired = 0; }

  try { Object.assign(results, runRetentionCleanup()); }
  catch (e) { console.error("Cron: cleanup error:", e); }

  try { results.autoArchiveSent = await runAutoArchive(); }
  catch (e) { console.error("Cron: auto-archive error:", e); results.autoArchiveSent = 0; }

  return Response.json({ ok: true, results });
}
