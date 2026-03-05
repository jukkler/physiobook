import { describe, it, expect } from "vitest";
import { escapeHtml } from "@/lib/html";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });
  it("escapes angle brackets and quotes", () => {
    expect(escapeHtml('<script>"alert"</script>')).toBe(
      "&lt;script&gt;&quot;alert&quot;&lt;/script&gt;"
    );
  });
  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });
  it("leaves safe text unchanged", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});
