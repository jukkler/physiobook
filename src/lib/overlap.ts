import { getDb } from "./db";

/**
 * Check if two time intervals overlap.
 * Intervals are half-open: [start, end)
 * Overlap iff: newStart < existingEnd AND newEnd > existingStart
 */
export function hasOverlap(
  newStart: number,
  newEnd: number,
  existingStart: number,
  existingEnd: number
): boolean {
  return newStart < existingEnd && newEnd > existingStart;
}

export interface ConflictResult {
  id: string;
  startTime: number;
  endTime: number;
}

/**
 * Find appointment conflicts in the database for a given time range.
 * Checks against CONFIRMED and REQUESTED appointments.
 */
export function findAppointmentConflicts(
  startTimeMs: number,
  endTimeMs: number,
  excludeId?: string
): ConflictResult[] {
  const db = getDb();

  if (excludeId) {
    return db
      .prepare(
        `SELECT id, start_time as startTime, end_time as endTime
         FROM appointments
         WHERE status IN ('CONFIRMED', 'REQUESTED')
         AND start_time < ? AND end_time > ?
         AND id != ?`
      )
      .all(endTimeMs, startTimeMs, excludeId) as ConflictResult[];
  }

  return db
    .prepare(
      `SELECT id, start_time as startTime, end_time as endTime
       FROM appointments
       WHERE status IN ('CONFIRMED', 'REQUESTED')
       AND start_time < ? AND end_time > ?`
    )
    .all(endTimeMs, startTimeMs) as ConflictResult[];
}

/**
 * Find blocker conflicts in the database for a given time range.
 */
export function findBlockerConflicts(
  startTimeMs: number,
  endTimeMs: number
): ConflictResult[] {
  const db = getDb();

  return db
    .prepare(
      `SELECT id, start_time as startTime, end_time as endTime
       FROM blockers
       WHERE start_time < ? AND end_time > ?`
    )
    .all(endTimeMs, startTimeMs) as ConflictResult[];
}

/**
 * Check if a time range has any conflicts (appointments or blockers).
 */
export function hasConflicts(
  startTimeMs: number,
  endTimeMs: number,
  excludeAppointmentId?: string
): boolean {
  const appointmentConflicts = findAppointmentConflicts(
    startTimeMs,
    endTimeMs,
    excludeAppointmentId
  );
  if (appointmentConflicts.length > 0) return true;

  const blockerConflicts = findBlockerConflicts(startTimeMs, endTimeMs);
  return blockerConflicts.length > 0;
}
