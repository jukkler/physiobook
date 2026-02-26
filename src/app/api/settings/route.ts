import { drizzle } from "drizzle-orm/better-sqlite3";
import { getDb } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

// GET /api/settings
export const GET = withApiAuth(async () => {
  const db = drizzle(getDb());
  const allSettings = await db.select().from(settings);

  const result: Record<string, string> = {};
  for (const s of allSettings) {
    result[s.key] = s.value;
  }

  return Response.json(result);
});

// PATCH /api/settings
export const PATCH = withApiAuth(async (req) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const allowedKeys = [
    "morningStart",
    "morningEnd",
    "afternoonStart",
    "afternoonEnd",
    "slotDuration",
    "requestTimeoutHours",
    "retentionDaysExpired",
    "retentionDaysPast",
    "adminNotifyEmail",
    "smtpHost",
    "smtpPort",
    "smtpUser",
    "smtpPass",
    "smtpFrom",
    "autoArchiveEnabled",
    "autoArchiveInterval",
    "autoArchiveType",
    "autoArchiveEmail",
    "cronJobEmail",
    "reminderNotificationsEnabled",
  ];

  // Validate values
  const timeKeys = ["morningStart", "morningEnd", "afternoonStart", "afternoonEnd"];
  const intKeys = ["requestTimeoutHours", "retentionDaysExpired", "retentionDaysPast"];

  for (const [key, value] of Object.entries(body)) {
    if (!allowedKeys.includes(key)) continue;

    if (timeKeys.includes(key) && !/^\d{2}:\d{2}$/.test(value)) {
      return Response.json({ error: `${key} muss im Format HH:MM sein` }, { status: 400 });
    }

    if (key === "slotDuration" && ![15, 30, 45, 60].includes(Number(value))) {
      return Response.json({ error: "slotDuration muss 15, 30, 45 oder 60 sein" }, { status: 400 });
    }

    if (intKeys.includes(key)) {
      const num = Number(value);
      if (!Number.isInteger(num) || num < 1) {
        return Response.json({ error: `${key} muss eine positive Ganzzahl sein` }, { status: 400 });
      }
    }

    if (key === "adminNotifyEmail" && value !== "") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return Response.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
      }
    }

    if (key === "smtpPort" && value !== "") {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return Response.json({ error: "SMTP-Port muss zwischen 1 und 65535 liegen" }, { status: 400 });
      }
    }

    if (key === "smtpFrom" && value !== "") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return Response.json({ error: "Ungültige Absender-E-Mail-Adresse" }, { status: 400 });
      }
    }

    if (key === "autoArchiveEnabled" && !["true", "false"].includes(value)) {
      return Response.json({ error: "autoArchiveEnabled muss 'true' oder 'false' sein" }, { status: 400 });
    }

    if (key === "autoArchiveInterval" && !["daily", "weekly", "monthly"].includes(value)) {
      return Response.json({ error: "autoArchiveInterval muss 'daily', 'weekly' oder 'monthly' sein" }, { status: 400 });
    }

    if (key === "autoArchiveType" && !["week", "month", "year"].includes(value)) {
      return Response.json({ error: "autoArchiveType muss 'week', 'month' oder 'year' sein" }, { status: 400 });
    }

    if (key === "autoArchiveEmail" && value !== "") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return Response.json({ error: "Ungültige Archiv-E-Mail-Adresse" }, { status: 400 });
      }
    }

    if (key === "cronJobEmail" && value !== "") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return Response.json({ error: "Ungültige Cron-Job-E-Mail-Adresse" }, { status: 400 });
      }
    }

    if (key === "reminderNotificationsEnabled" && !["true", "false"].includes(value)) {
      return Response.json({ error: "reminderNotificationsEnabled muss 'true' oder 'false' sein" }, { status: 400 });
    }
  }

  const db = getDb();

  for (const [key, value] of Object.entries(body)) {
    if (!allowedKeys.includes(key)) continue;

    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = ?`
    ).run(key, value, value);
  }

  return Response.json({ ok: true });
});
