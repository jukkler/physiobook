import { describe, expect, it } from "vitest";
import {
  generateSeriesOccurrences,
  inferSeriesIntervalWeeks,
  normalizeSeriesScope,
  summarizeInterval,
} from "@/lib/series-rules";

function expectExactErrorMessage(action: () => unknown, expectedMessage: string) {
  try {
    action();
  } catch (error) {
    expect((error as Error).message).toBe(expectedMessage);
    return;
  }

  throw new Error(`Expected error with message: ${expectedMessage}`);
}

describe("generateSeriesOccurrences", () => {
  it("generates weekly occurrences from the selected start time", () => {
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    expect(generateSeriesOccurrences({ startTime: start, durationMinutes: 30, count: 3, intervalWeeks: 1 })).toEqual([
      { index: 0, start: start, end: start + 30 * 60_000, originalStart: start },
      { index: 1, start: start + 7 * 86_400_000, end: start + 7 * 86_400_000 + 30 * 60_000, originalStart: start + 7 * 86_400_000 },
      { index: 2, start: start + 14 * 86_400_000, end: start + 14 * 86_400_000 + 30 * 60_000, originalStart: start + 14 * 86_400_000 },
    ]);
  });

  it("rejects unsupported interval values", () => {
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    expectExactErrorMessage(
      () => generateSeriesOccurrences({ startTime: start, durationMinutes: 30, count: 3, intervalWeeks: 5 }),
      "intervalWeeks must be 1, 2, 3, or 4",
    );
  });

  it("rejects counts outside the supported appointment series range", () => {
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    expectExactErrorMessage(
      () => generateSeriesOccurrences({ startTime: start, durationMinutes: 30, count: 0, intervalWeeks: 1 }),
      "count must be between 1 and 52",
    );
    expectExactErrorMessage(
      () => generateSeriesOccurrences({ startTime: start, durationMinutes: 30, count: 53, intervalWeeks: 1 }),
      "count must be between 1 and 52",
    );
  });
});

describe("inferSeriesIntervalWeeks", () => {
  it("infers two-week intervals from sorted occurrence starts", () => {
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    expect(inferSeriesIntervalWeeks([start, start + 14 * 86_400_000, start + 28 * 86_400_000])).toBe(2);
  });

  it("falls back to weekly when there is not enough information", () => {
    expect(inferSeriesIntervalWeeks([Date.parse("2026-06-03T07:00:00.000Z")])).toBe(1);
  });
});

describe("normalizeSeriesScope", () => {
  it("accepts the three supported scopes", () => {
    expect(normalizeSeriesScope("single")).toBe("single");
    expect(normalizeSeriesScope("future")).toBe("future");
    expect(normalizeSeriesScope("series")).toBe("series");
  });

  it("defaults missing scope to single", () => {
    expect(normalizeSeriesScope(null)).toBe("single");
  });

  it("rejects unknown scopes", () => {
    expectExactErrorMessage(
      () => normalizeSeriesScope("all"),
      "scope muss 'single', 'future' oder 'series' sein",
    );
  });
});

describe("summarizeInterval", () => {
  it("returns concise German labels", () => {
    expect(summarizeInterval(1)).toBe("wöchentlich");
    expect(summarizeInterval(2)).toBe("alle 2 Wochen");
    expect(summarizeInterval(4)).toBe("alle 4 Wochen");
  });
});
