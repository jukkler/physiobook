import { getDb } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { corsHeaders, handlePreflight } from "@/lib/cors";

export async function OPTIONS(req: Request) {
  return handlePreflight(req) ?? new Response(null, { status: 204 });
}

// GET /api/slots/availability?dates=2026-03-14,2026-03-15,...
export async function GET(req: Request) {
  const cors = corsHeaders(req);
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`slots-avail:${ip}`, 10, 60 * 1000);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Zu viele Anfragen. Bitte warten." },
      { status: 429, headers: cors }
    );
  }

  const url = new URL(req.url);
  const datesParam = url.searchParams.get("dates");
  if (!datesParam) {
    return Response.json(
      { error: "dates Parameter fehlt" },
      { status: 400, headers: cors }
    );
  }

  const dates = datesParam.split(",").filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (dates.length === 0 || dates.length > 35) {
    return Response.json(
      { error: "Ungültige dates (1-35 Daten erlaubt)" },
      { status: 400, headers: cors }
    );
  }

  const db = getDb();

  // Load settings once
  const settingsRows = db
    .prepare("SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?, ?)")
    .all("morningStart", "morningEnd", "afternoonStart", "afternoonEnd", "slotDuration") as {
    key: string;
    value: string;
  }[];

  const config: Record<string, string> = {};
  for (const row of settingsRows) {
    config[row.key] = row.value;
  }

  const morningStart = config.morningStart || "08:00";
  const morningEnd = config.morningEnd || "13:00";
  const afternoonStart = config.afternoonStart || "15:00";
  const rawAfternoonEnd = config.afternoonEnd || "20:00";
  const afternoonEnd = rawAfternoonEnd > "19:00" ? "19:00" : rawAfternoonEnd;
  const slotDuration = parseInt(config.slotDuration || "30", 10);

  const now = Date.now();
  const result: Record<string, boolean> = {};

  // Compute overall time range across all dates for a single DB query
  let globalMinMs = Infinity;
  let globalMaxMs = -Infinity;

  interface DateSlots {
    date: string;
    slots: { startMs: number; endMs: number }[];
  }

  const allDateSlots: DateSlots[] = [];

  for (const dateStr of dates) {
    const [year, month, day] = dateStr.split("-").map(Number);
    const approxDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const berlinDay = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      weekday: "short",
    }).format(approxDate);

    if (berlinDay === "Sun") {
      result[dateStr] = false;
      continue;
    }

    const isSaturday = berlinDay === "Sat";
    const timeRanges = isSaturday
      ? [{ start: "10:00", end: "13:00" }]
      : [
          { start: morningStart, end: morningEnd },
          { start: afternoonStart, end: afternoonEnd },
        ];

    const slots: { startMs: number; endMs: number }[] = [];

    for (const range of timeRanges) {
      const [startH, startM] = range.start.split(":").map(Number);
      const [endH, endM] = range.end.split(":").map(Number);
      let currentMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      while (currentMinutes + slotDuration <= endMinutes) {
        const hours = Math.floor(currentMinutes / 60);
        const mins = currentMinutes % 60;
        const utcMs = berlinToUtcMs(dateStr, hours, mins);
        const slotEndMs = utcMs + slotDuration * 60_000;

        if (utcMs > now) {
          slots.push({ startMs: utcMs, endMs: slotEndMs });
          if (utcMs < globalMinMs) globalMinMs = utcMs;
          if (slotEndMs > globalMaxMs) globalMaxMs = slotEndMs;
        }

        currentMinutes += slotDuration;
      }
    }

    if (slots.length === 0) {
      result[dateStr] = false;
    } else {
      allDateSlots.push({ date: dateStr, slots });
    }
  }

  if (allDateSlots.length === 0) {
    return Response.json(result, { headers: cors });
  }

  // Single DB query for the entire range
  const occupiedAppointments = db
    .prepare(
      `SELECT start_time, end_time FROM appointments
       WHERE status IN ('CONFIRMED', 'REQUESTED')
       AND start_time < ? AND end_time > ?`
    )
    .all(globalMaxMs, globalMinMs) as { start_time: number; end_time: number }[];

  const occupiedBlockers = db
    .prepare(
      `SELECT start_time, end_time FROM blockers
       WHERE start_time < ? AND end_time > ?`
    )
    .all(globalMaxMs, globalMinMs) as { start_time: number; end_time: number }[];

  const occupied = [...occupiedAppointments, ...occupiedBlockers];

  for (const { date, slots } of allDateSlots) {
    const hasAvailable = slots.some(
      (slot) =>
        !occupied.some(
          (occ) => slot.startMs < occ.end_time && slot.endMs > occ.start_time
        )
    );
    result[date] = hasAvailable;
  }

  return Response.json(result, { headers: cors });
}

function berlinToUtcMs(dateStr: string, hours: number, minutes: number): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(approxUtc);
  const berlinHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  let offsetHours = berlinHour - hours;
  if (offsetHours > 12) offsetHours -= 24;
  if (offsetHours < -12) offsetHours += 24;
  return Date.UTC(year, month - 1, day, hours - offsetHours, minutes, 0);
}
