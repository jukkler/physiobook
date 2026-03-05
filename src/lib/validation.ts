// src/lib/validation.ts
export const VALID_DURATIONS = [15, 30, 45, 60, 90] as const;
export type DurationMinutes = (typeof VALID_DURATIONS)[number];

export function isValidDuration(minutes: number): minutes is DurationMinutes {
  return (VALID_DURATIONS as readonly number[]).includes(minutes);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
