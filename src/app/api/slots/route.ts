import { getDb } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { corsHeaders, handlePreflight } from "@/lib/cors";

interface SlotInfo {
  startTimeMs: number;
  endTimeMs: number;
  startTimeLocal: string;
  endTimeLocal: string;
}

// OPTIONS /api/slots (CORS preflight)
export async function OPTIONS(req: Request) {
  return handlePreflight(req) ?? new Response(null, { status: 204 });
}

// GET /api/slots?date=YYYY-MM-DD
export async function GET(req: Request) {
  const cors = corsHeaders(req);
  // Rate limit
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`slots:${ip}`, 60, 60 * 1000);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Zu viele Anfragen. Bitte warten." },
      { status: 429, headers: cors }
    );
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return Response.json(
      { error: "Ungültiger date-Parameter (YYYY-MM-DD)" },
      { status: 400, headers: cors }
    );
  }

  const db = getDb();

  // Load settings
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
  // Cap at 19:00 so last bookable slot is 18:30 (with 30min duration)
  const rawAfternoonEnd = config.afternoonEnd || "20:00";
  const afternoonEnd = rawAfternoonEnd > "19:00" ? "19:00" : rawAfternoonEnd;
  const slotDuration = parseInt(config.slotDuration || "30", 10);

  // Determine day of week in Europe/Berlin timezone
  const [year, month, day] = dateParam.split("-").map(Number);
  const approxDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // noon UTC to avoid DST edge
  const berlinDay = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    weekday: "short",
  }).format(approxDate);

  // Sunday → no slots
  if (berlinDay === "Sun") {
    return Response.json([], { headers: cors });
  }

  // Build time ranges based on day of week
  const isSaturday = berlinDay === "Sat";
  const isThursday = berlinDay === "Thu";

  // Thursday: morning ends at 12:30 instead of 13:00
  const effectiveMorningEnd = isThursday ? "12:30" : morningEnd;

  // Generate time slots for the given date in Europe/Berlin
  const slots: SlotInfo[] = [];

  const timeRanges: { start: string; end: string }[] = isSaturday
    ? [{ start: "10:00", end: "12:00" }]
    : [
        { start: morningStart, end: effectiveMorningEnd },
        { start: afternoonStart, end: afternoonEnd },
      ];

  for (const range of timeRanges) {
    const [startH, startM] = range.start.split(":").map(Number);
    const [endH, endM] = range.end.split(":").map(Number);

    // Create date in Europe/Berlin timezone
    // We use a trick: create the date string and parse as the target timezone
    let currentMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    while (currentMinutes + slotDuration <= endMinutes) {
      const hours = Math.floor(currentMinutes / 60);
      const mins = currentMinutes % 60;

      // Convert Europe/Berlin local time to UTC epoch ms
      const utcMs = berlinToUtcMs(dateParam, hours, mins);

      const slotEndMs = utcMs + slotDuration * 60_000;

      const endMins = currentMinutes + slotDuration;
      const endHours = Math.floor(endMins / 60);
      const endMinsRem = endMins % 60;

      slots.push({
        startTimeMs: utcMs,
        endTimeMs: slotEndMs,
        startTimeLocal: `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`,
        endTimeLocal: `${String(endHours).padStart(2, "0")}:${String(endMinsRem).padStart(2, "0")}`,
      });

      currentMinutes += slotDuration;
    }
  }

  // Filter out slots that are in the past
  const now = Date.now();
  const futureSlots = slots.filter((s) => s.startTimeMs > now);

  // Get occupied times (CONFIRMED + REQUESTED appointments and blockers)
  const dayStartMs = futureSlots.length > 0 ? futureSlots[0].startTimeMs : 0;
  const dayEndMs = futureSlots.length > 0 ? futureSlots[futureSlots.length - 1].endTimeMs : 0;

  if (futureSlots.length === 0) {
    return Response.json([], { headers: cors });
  }

  const occupiedAppointments = db
    .prepare(
      `SELECT start_time, end_time FROM appointments
       WHERE status IN ('CONFIRMED', 'REQUESTED')
       AND start_time < ? AND end_time > ?`
    )
    .all(dayEndMs, dayStartMs) as { start_time: number; end_time: number }[];

  const occupiedBlockers = db
    .prepare(
      `SELECT start_time, end_time FROM blockers
       WHERE start_time < ? AND end_time > ?`
    )
    .all(dayEndMs, dayStartMs) as { start_time: number; end_time: number }[];

  const occupied = [...occupiedAppointments, ...occupiedBlockers];

  // Filter available slots
  const availableSlots = futureSlots.filter((slot) => {
    return !occupied.some(
      (occ) => slot.startTimeMs < occ.end_time && slot.endTimeMs > occ.start_time
    );
  });

  return Response.json(availableSlots, { headers: cors });
}

/**
 * Convert a Europe/Berlin local time to UTC epoch milliseconds.
 * Uses Intl.DateTimeFormat to determine the correct UTC offset.
 */
function berlinToUtcMs(
  dateStr: string,
  hours: number,
  minutes: number
): number {
  // Build an approximate UTC date first
  const [year, month, day] = dateStr.split("-").map(Number);
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));

  // Use Intl to find the Berlin offset at this approximate time
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

  // Get Berlin local time for our approximate UTC
  const parts = formatter.formatToParts(approxUtc);
  const berlinHour = parseInt(
    parts.find((p) => p.type === "hour")?.value || "0",
    10
  );

  // The offset is the difference between Berlin local hour and UTC hour
  let offsetHours = berlinHour - hours;
  // Handle day boundary
  if (offsetHours > 12) offsetHours -= 24;
  if (offsetHours < -12) offsetHours += 24;

  // The actual UTC time = local time - offset
  const utcMs = Date.UTC(year, month - 1, day, hours - offsetHours, minutes, 0);

  return utcMs;
}
