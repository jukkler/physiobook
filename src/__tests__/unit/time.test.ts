import { describe, it, expect } from "vitest";
import { getIsoWeekNumber } from "@/lib/time";

describe("getIsoWeekNumber", () => {
  it("returns correct week for known dates", () => {
    expect(getIsoWeekNumber("2026-01-05")).toBe(2);
    expect(getIsoWeekNumber("2025-12-29")).toBe(1);
  });
  it("handles mid-year correctly", () => {
    expect(getIsoWeekNumber("2026-03-02")).toBe(10);
  });
});
