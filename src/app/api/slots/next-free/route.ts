import { getDb } from "@/lib/db";
import { withApiAuth } from "@/lib/auth";
import { todayBerlin, addDays } from "@/lib/time";

interface FreeSlot {
  startTimeMs: number;
  endTimeMs: number;
  startTimeLocal: string;
  endTimeLocal: string;
  dateStr: string;
  weekday: string;
}

const WEEKDAY_DE: Record<string, string> = {
  Mon: "Mo",
  Tue: "Di",
  Wed: "Mi",
  Thu: "Do",
  Fri: "Fr",
  Sat: "Sa",
  Sun: "So",
};

export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const count = Math.min(Math.max(parseInt(url.searchParams.get("count") || "5", 10) || 5, 1), 20);
  const offset = Math.min(Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0), 200);

  const db = getDb();

  // Load settings
  const settingsRows = db
    .prepare("SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?, ?)")
    .all("morningStart", "morningEnd", "afternoonStart", "afternoonEnd", "slotDuration") as {
    key: string;
    value: string;
  }[];

  const config: Record<string, string> = {};
  for (const row of settingsRows) config[row.key] = row.value;

  const morningStart = config.morningStart || "08:00";
  const morningEnd = config.morningEnd || "13:00";
  const afternoonStart = config.afternoonStart || "15:00";
  const rawAfternoonEnd = config.afternoonEnd || "20:00";
  const afternoonEnd = rawAfternoonEnd > "19:00" ? "19:00" : rawAfternoonEnd;
  const slotDuration = parseInt(config.slotDuration || "30", 10);

  const now = Date.now();
  const collected: FreeSlot[] = [];
  let skipped = 0;
  let currentDate = todayBerlin();
  const MAX_DAYS = 90;

  for (let dayIdx = 0; dayIdx < MAX_DAYS && collected.length < count + 1; dayIdx++) {
    // Determine weekday
    const [year, month, day] = currentDate.split("-").map(Number);
    const approxDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const berlinDay = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      weekday: "short",
    }).format(approxDate);

    // Skip Sunday
    if (berlinDay === "Sun") {
      currentDate = addDays(currentDate, 1);
      continue;
    }

    const isSaturday = berlinDay === "Sat";
    const timeRanges: { start: string; end: string }[] = isSaturday
      ? [{ start: "10:00", end: "13:00" }]
      : [
          { start: morningStart, end: morningEnd },
          { start: afternoonStart, end: afternoonEnd },
        ];

    // Generate all slots for this day
    interface SlotCandidate {
      startTimeMs: number;
      endTimeMs: number;
      startTimeLocal: string;
      endTimeLocal: string;
    }
    const daySlots: SlotCandidate[] = [];

    for (const range of timeRanges) {
      const [startH, startM] = range.start.split(":").map(Number);
      const [endH, endM] = range.end.split(":").map(Number);
      let currentMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      while (currentMinutes + slotDuration <= endMinutes) {
        const hours = Math.floor(currentMinutes / 60);
        const mins = currentMinutes % 60;
        const utcMs = berlinToUtcMs(currentDate, hours, mins);
        const slotEndMs = utcMs + slotDuration * 60_000;

        const endMins = currentMinutes + slotDuration;
        const endHours = Math.floor(endMins / 60);
        const endMinsRem = endMins % 60;

        daySlots.push({
          startTimeMs: utcMs,
          endTimeMs: slotEndMs,
          startTimeLocal: `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`,
          endTimeLocal: `${String(endHours).padStart(2, "0")}:${String(endMinsRem).padStart(2, "0")}`,
        });

        currentMinutes += slotDuration;
      }
    }

    // Filter past slots
    const futureSlots = daySlots.filter((s) => s.startTimeMs > now);
    if (futureSlots.length === 0) {
      currentDate = addDays(currentDate, 1);
      continue;
    }

    // Query occupied for this day
    const dayStartMs = futureSlots[0].startTimeMs;
    const dayEndMs = futureSlots[futureSlots.length - 1].endTimeMs;

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

    // Filter to free slots
    const freeSlots = futureSlots.filter((slot) => {
      return !occupied.some(
        (occ) => slot.startTimeMs < occ.end_time && slot.endTimeMs > occ.start_time
      );
    });

    const weekdayDe = WEEKDAY_DE[berlinDay] || berlinDay;

    for (const slot of freeSlots) {
      if (skipped < offset) {
        skipped++;
        continue;
      }
      collected.push({
        ...slot,
        dateStr: currentDate,
        weekday: weekdayDe,
      });
      if (collected.length > count) break;
    }

    currentDate = addDays(currentDate, 1);
  }

  const hasMore = collected.length > count;
  return Response.json({
    slots: collected.slice(0, count),
    hasMore,
  });
});

/**
 * Convert a Europe/Berlin local time to UTC epoch milliseconds.
 */
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
