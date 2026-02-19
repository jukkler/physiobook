import { describe, it, expect } from "vitest";
import { filterNotes } from "@/lib/notes-filter";

describe("filterNotes", () => {
  it("allows empty/null notes", () => {
    expect(filterNotes(null)).toEqual({ allowed: true, flagged: false });
    expect(filterNotes(undefined)).toEqual({ allowed: true, flagged: false });
    expect(filterNotes("")).toEqual({ allowed: true, flagged: false });
  });

  it("allows valid treatment abbreviations", () => {
    expect(filterNotes("KG")).toEqual({ allowed: true, flagged: false });
    expect(filterNotes("MT, Lymph")).toEqual({ allowed: true, flagged: false });
    expect(filterNotes("KG 6x")).toEqual({ allowed: true, flagged: false });
  });

  it("blocks medical diagnostic terms", () => {
    const result = filterNotes("Diagnose: Bandscheibenvorfall");
    expect(result.allowed).toBe(false);
  });

  it("blocks symptom descriptions", () => {
    const result = filterNotes("Schmerzen im Rücken");
    expect(result.allowed).toBe(false);
  });

  it("blocks medication references", () => {
    const result = filterNotes("Medikament Ibuprofen");
    expect(result.allowed).toBe(false);
  });

  it("rejects notes exceeding 200 chars", () => {
    const longNote = "x".repeat(201);
    const result = filterNotes(longNote);
    expect(result.allowed).toBe(false);
  });

  it("flags borderline terms (allowed but flagged)", () => {
    const result = filterNotes("Untersuchung nötig");
    expect(result.allowed).toBe(true);
    expect(result.flagged).toBe(true);
  });

  it("allows notes at exactly 200 chars", () => {
    const note = "x".repeat(200);
    expect(filterNotes(note).allowed).toBe(true);
  });
});
