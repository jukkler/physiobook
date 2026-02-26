/**
 * Time utilities for converting between epoch ms and Europe/Berlin display.
 */

const BERLIN_TZ = "Europe/Berlin";

export function formatBerlinTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("de-DE", {
    timeZone: BERLIN_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBerlinDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("de-DE", {
    timeZone: BERLIN_TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatBerlinDateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString("de-DE", {
    timeZone: BERLIN_TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get the start of a day in Europe/Berlin as epoch ms.
 */
export function berlinDayStartMs(dateStr: string): number {
  // dateStr = "YYYY-MM-DD"
  const [year, month, day] = dateStr.split("-").map(Number);
  // Create midnight in Berlin
  const approx = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  // Find the actual UTC offset for Berlin at this time
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(approx);
  const berlinHour = parseInt(
    parts.find((p) => p.type === "hour")?.value || "0",
    10
  );

  // Offset = berlin hour - UTC hour (which we set to 0)
  let offsetHours = berlinHour;
  if (offsetHours > 12) offsetHours -= 24;

  // Midnight Berlin = UTC midnight - offset
  return Date.UTC(year, month - 1, day, -offsetHours, 0, 0);
}

/**
 * Get today's date string in Europe/Berlin.
 */
export function todayBerlin(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

/**
 * Add days to a date string.
 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T12:00:00Z"); // noon to avoid DST issues
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

/**
 * Get the Monday of the week containing the given date.
 */
export function getWeekMonday(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00Z");
  const dayOfWeek = date.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().split("T")[0];
}

/**
 * Convert epoch ms to date input value (YYYY-MM-DD) in Europe/Berlin.
 */
export function epochToDateInput(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/**
 * Convert epoch ms to time input value (HH:MM) in Europe/Berlin.
 */
export function epochToTimeInput(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BERLIN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

/**
 * Convert date string (YYYY-MM-DD) + time string (HH:MM) in Europe/Berlin to epoch ms.
 */
export function dateTimeToEpoch(dateStr: string, timeStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));

  const berlinFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: BERLIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = berlinFormatter.formatToParts(utcGuess);
  const berlinHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const berlinMinute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

  let offsetMinutes = (berlinHour * 60 + berlinMinute) - (hours * 60 + minutes);
  if (offsetMinutes > 720) offsetMinutes -= 1440;
  if (offsetMinutes < -720) offsetMinutes += 1440;

  return Date.UTC(year, month - 1, day, hours, minutes, 0) - offsetMinutes * 60_000;
}
