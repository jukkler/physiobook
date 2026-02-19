import { describe, it, expect } from "vitest";
import { hasOverlap } from "@/lib/overlap";

describe("hasOverlap", () => {
  // [100, 200) = slot being checked
  const slotStart = 100;
  const slotEnd = 200;

  it("detects identical intervals as overlapping", () => {
    expect(hasOverlap(slotStart, slotEnd, 100, 200)).toBe(true);
  });

  it("detects partial overlap (existing starts before, ends during)", () => {
    expect(hasOverlap(slotStart, slotEnd, 50, 150)).toBe(true);
  });

  it("detects partial overlap (existing starts during, ends after)", () => {
    expect(hasOverlap(slotStart, slotEnd, 150, 250)).toBe(true);
  });

  it("detects nested interval (existing completely inside)", () => {
    expect(hasOverlap(slotStart, slotEnd, 120, 180)).toBe(true);
  });

  it("detects enclosing interval (existing completely surrounds)", () => {
    expect(hasOverlap(slotStart, slotEnd, 50, 250)).toBe(true);
  });

  it("no overlap: adjacent intervals (existing ends at slot start)", () => {
    expect(hasOverlap(slotStart, slotEnd, 0, 100)).toBe(false);
  });

  it("no overlap: adjacent intervals (existing starts at slot end)", () => {
    expect(hasOverlap(slotStart, slotEnd, 200, 300)).toBe(false);
  });

  it("no overlap: completely before", () => {
    expect(hasOverlap(slotStart, slotEnd, 0, 50)).toBe(false);
  });

  it("no overlap: completely after", () => {
    expect(hasOverlap(slotStart, slotEnd, 300, 400)).toBe(false);
  });

  it("overlap: single ms overlap at start", () => {
    expect(hasOverlap(slotStart, slotEnd, 99, 101)).toBe(true);
  });

  it("overlap: single ms overlap at end", () => {
    expect(hasOverlap(slotStart, slotEnd, 199, 201)).toBe(true);
  });
});

describe("hasOverlap with realistic appointment times", () => {
  // 30 min appointment: 09:00 - 09:30 (Berlin) as epoch ms
  const start = new Date("2026-03-15T08:00:00Z").getTime(); // 09:00 Berlin (CET)
  const end = start + 30 * 60_000; // 09:30 Berlin

  it("detects conflict with 09:15-09:45 appointment", () => {
    const conflictStart = start + 15 * 60_000; // 09:15
    const conflictEnd = conflictStart + 30 * 60_000; // 09:45
    expect(hasOverlap(start, end, conflictStart, conflictEnd)).toBe(true);
  });

  it("no conflict with 09:30-10:00 appointment (adjacent)", () => {
    const nextStart = end; // 09:30
    const nextEnd = nextStart + 30 * 60_000; // 10:00
    expect(hasOverlap(start, end, nextStart, nextEnd)).toBe(false);
  });

  it("no conflict with 08:30-09:00 appointment (adjacent before)", () => {
    const prevStart = start - 30 * 60_000; // 08:30
    const prevEnd = start; // 09:00
    expect(hasOverlap(start, end, prevStart, prevEnd)).toBe(false);
  });
});

describe("DST edge cases (Europe/Berlin)", () => {
  // 2026-03-29: Winter→Sommerzeit, clock jumps 02:00→03:00
  // Using epoch ms which is timezone-agnostic, DST doesn't affect overlap logic
  it("slots near DST transition (2026-03-29) are correctly adjacent in UTC", () => {
    // Around DST: 00:30 UTC = 01:30 CET, 01:00 UTC = 03:00 CEST (clock jumps 02→03)
    // But in epoch ms these are exactly 30 min apart, so 30-min slots are adjacent
    const slot1Start = new Date("2026-03-29T00:30:00Z").getTime();
    const slot1End = slot1Start + 30 * 60_000; // equals 01:00 UTC

    const slot2Start = new Date("2026-03-29T01:00:00Z").getTime();
    const slot2End = slot2Start + 30 * 60_000;

    // Adjacent: slot1End === slot2Start, half-open intervals don't overlap
    expect(hasOverlap(slot1Start, slot1End, slot2Start, slot2End)).toBe(false);

    // But overlapping slots during the transition are still detected
    const overlapStart = slot1Start + 15 * 60_000; // 00:45 UTC
    const overlapEnd = overlapStart + 30 * 60_000; // 01:15 UTC
    expect(hasOverlap(slot1Start, slot1End, overlapStart, overlapEnd)).toBe(true);
  });

  // 2026-10-25: Sommerzeit→Winterzeit, clock jumps 03:00→02:00
  it("slots near DST fallback (2026-10-25) don't create duplicate overlaps", () => {
    // 00:30 UTC = 02:30 CEST (before change)
    const slot1Start = new Date("2026-10-25T00:30:00Z").getTime();
    const slot1End = slot1Start + 30 * 60_000;

    // 01:30 UTC = 02:30 CET (after change, same local time!)
    const slot2Start = new Date("2026-10-25T01:30:00Z").getTime();
    const slot2End = slot2Start + 30 * 60_000;

    // These are 1 hour apart in UTC, so they don't overlap
    expect(hasOverlap(slot1Start, slot1End, slot2Start, slot2End)).toBe(false);
  });
});
