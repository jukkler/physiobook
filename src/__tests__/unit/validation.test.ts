import { describe, it, expect } from "vitest";
import { isValidEmail, isValidDuration, VALID_DURATIONS } from "@/lib/validation";

describe("isValidEmail", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("a@b.c")).toBe(true);
  });
  it("rejects invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("@no-local.com")).toBe(false);
    expect(isValidEmail("spaces in@email.com")).toBe(false);
  });
});

describe("isValidDuration", () => {
  it("accepts valid durations", () => {
    for (const d of VALID_DURATIONS) {
      expect(isValidDuration(d)).toBe(true);
    }
  });
  it("rejects invalid durations", () => {
    expect(isValidDuration(10)).toBe(false);
    expect(isValidDuration(120)).toBe(false);
    expect(isValidDuration(0)).toBe(false);
  });
});
