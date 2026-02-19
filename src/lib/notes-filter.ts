/**
 * Server-side blocklist filter for admin notes.
 * Rejects notes containing medical/health-related terms.
 * Returns { allowed: true, flagged: false } for clean notes.
 * Returns { allowed: false } for blocked notes.
 * Returns { allowed: true, flagged: true } for borderline notes.
 */

// Hard block: clearly medical/diagnostic terms (German)
const BLOCKED_PATTERNS = [
  /diagnos/i,
  /befund/i,
  /symptom/i,
  /schmerz/i,
  /entz[üu]nd/i,
  /fraktur/i,
  /operation/i,
  /medikament/i,
  /krankheit/i,
  /therapiebericht/i,
  /anamnese/i,
  /pathologi/i,
  /r[öo]ntgen/i,
  /mrt\b/i,
  /ct\b/i,
  /tumor/i,
  /arthros/i,
  /hernie/i,
  /prolaps/i,
  /degenerat/i,
  /fibromyalg/i,
  /rheuma/i,
  /depression/i,
  /allergi/i,
  /blutdruck/i,
  /diabetes/i,
];

// Soft flag: could be medical context but might be abbreviations
const FLAGGED_PATTERNS = [
  /beschwerden/i,
  /untersuchung/i,
  /behandlung\s+wegen/i,
  /arzt/i,
  /klinik/i,
  /rezept/i,
];

const MAX_LENGTH = 200;

interface FilterResult {
  allowed: boolean;
  flagged: boolean;
  reason?: string;
}

export function filterNotes(notes: string | null | undefined): FilterResult {
  if (!notes || notes.trim().length === 0) {
    return { allowed: true, flagged: false };
  }

  if (notes.length > MAX_LENGTH) {
    return {
      allowed: false,
      flagged: false,
      reason: "Notiz darf maximal 200 Zeichen lang sein.",
    };
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(notes)) {
      return {
        allowed: false,
        flagged: false,
        reason:
          "Bitte nur Behandlungskürzel verwenden (z.B. KG, MT, Lymph). Keine medizinischen Details.",
      };
    }
  }

  for (const pattern of FLAGGED_PATTERNS) {
    if (pattern.test(notes)) {
      return { allowed: true, flagged: true };
    }
  }

  return { allowed: true, flagged: false };
}
