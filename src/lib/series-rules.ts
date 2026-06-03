import type { AppointmentSeriesScope } from "@/lib/db/schema";

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const SUPPORTED_INTERVALS = [1, 2, 3, 4] as const;

export interface GenerateSeriesOccurrencesInput {
  startTime: number;
  durationMinutes: number;
  count: number;
  intervalWeeks: number;
}

export interface GeneratedSeriesOccurrence {
  index: number;
  start: number;
  end: number;
  originalStart: number;
}

export function generateSeriesOccurrences(input: GenerateSeriesOccurrencesInput): GeneratedSeriesOccurrence[] {
  if (!SUPPORTED_INTERVALS.includes(input.intervalWeeks as 1 | 2 | 3 | 4)) {
    throw new Error("intervalWeeks must be 1, 2, 3, or 4");
  }
  if (input.count < 1 || input.count > 52) {
    throw new Error("count must be between 1 and 52");
  }

  const durationMs = input.durationMinutes * 60_000;
  return Array.from({ length: input.count }, (_, index) => {
    const start = input.startTime + index * input.intervalWeeks * MS_PER_WEEK;
    return { index, start, end: start + durationMs, originalStart: start };
  });
}

export function inferSeriesIntervalWeeks(sortedStarts: number[]): number {
  if (sortedStarts.length < 2) return 1;
  const weeks = Math.round((sortedStarts[1] - sortedStarts[0]) / MS_PER_WEEK);
  return SUPPORTED_INTERVALS.includes(weeks as 1 | 2 | 3 | 4) ? weeks : 1;
}

export function normalizeSeriesScope(scope: string | null): AppointmentSeriesScope {
  if (!scope) return "single";
  if (scope === "single" || scope === "future" || scope === "series") return scope;
  throw new Error("scope muss 'single', 'future' oder 'series' sein");
}

export function summarizeInterval(intervalWeeks: number): string {
  return intervalWeeks === 1 ? "wöchentlich" : `alle ${intervalWeeks} Wochen`;
}
