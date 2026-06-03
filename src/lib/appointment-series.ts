import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { syncPatient, updatePatientContact } from "@/lib/patients";
import { hasOverlap } from "@/lib/overlap";
import { generateSeriesOccurrences } from "@/lib/series-rules";

export interface AppointmentSeriesServiceDeps {
  db: Database.Database;
  now: () => number;
  uuid: () => string;
  syncPatient: typeof syncPatient;
  updatePatientContact: typeof updatePatientContact;
}

export interface CreateAppointmentSeriesInput {
  patientName: string;
  patientId?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  startTime: number;
  durationMinutes: number;
  status: string;
  notes?: string | null;
  flaggedNotes?: boolean;
  intervalWeeks: number;
  count: number;
  force?: boolean;
}

export function defaultAppointmentSeriesDeps(): AppointmentSeriesServiceDeps {
  return {
    db: getDb(),
    now: () => Date.now(),
    uuid: () => uuidv4(),
    syncPatient,
    updatePatientContact,
  };
}

export function createAppointmentSeries(
  input: CreateAppointmentSeriesInput,
  deps: AppointmentSeriesServiceDeps = defaultAppointmentSeriesDeps()
): { seriesId: string; created: string[] } {
  const occurrences = generateSeriesOccurrences({
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    count: input.count,
    intervalWeeks: input.intervalWeeks,
  });

  if (!input.force) {
    const rangeStart = occurrences[0].start;
    const rangeEnd = occurrences[occurrences.length - 1].end;
    const existingAppointments = deps.db.prepare(`
      SELECT id, patient_name as name, start_time as startTime, end_time as endTime
      FROM appointments
      WHERE status IN ('CONFIRMED', 'REQUESTED')
        AND start_time < ?
        AND end_time > ?
    `).all(rangeEnd, rangeStart) as { id: string; name: string; startTime: number; endTime: number }[];
    const existingBlockers = deps.db.prepare(`
      SELECT id, title as name, start_time as startTime, end_time as endTime
      FROM blockers
      WHERE start_time < ?
        AND end_time > ?
    `).all(rangeEnd, rangeStart) as { id: string; name: string; startTime: number; endTime: number }[];

    const conflicts = new Set<string>();
    for (const occurrence of occurrences) {
      for (const appointment of existingAppointments) {
        if (hasOverlap(occurrence.start, occurrence.end, appointment.startTime, appointment.endTime)) conflicts.add(appointment.id);
      }
      for (const blocker of existingBlockers) {
        if (hasOverlap(occurrence.start, occurrence.end, blocker.startTime, blocker.endTime)) conflicts.add(blocker.id);
      }
    }
    if (conflicts.size > 0) {
      throw new Error(`Zeitkonflikt: ${conflicts.size} Konflikte gefunden`);
    }
  }

  const now = deps.now();
  const seriesId = deps.uuid();
  const patientId = input.patientId || deps.syncPatient(input.patientName, input.contactEmail ?? null, input.contactPhone ?? null, now);
  const created: string[] = [];

  const insertAll = deps.db.transaction(() => {
    deps.db.prepare(`
      INSERT INTO appointment_series (
        id, patient_id, patient_name, first_start_time, duration_minutes, interval_weeks,
        occurrence_count, last_start_time, status, notes, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
    `).run(
      seriesId,
      patientId,
      input.patientName,
      occurrences[0].start,
      input.durationMinutes,
      input.intervalWeeks,
      input.count,
      occurrences[occurrences.length - 1].start,
      input.notes ?? null,
      now,
      now
    );

    const insertAppointment = deps.db.prepare(`
      INSERT INTO appointments (
        id, patient_name, patient_id, start_time, end_time, duration_minutes, status, series_id,
        series_occurrence_index, series_original_start_time, series_exception_type,
        notes, flagged_notes, reminder_sent, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)
    `);

    for (const occurrence of occurrences) {
      const id = deps.uuid();
      insertAppointment.run(
        id,
        input.patientName,
        patientId,
        occurrence.start,
        occurrence.end,
        input.durationMinutes,
        input.status,
        seriesId,
        occurrence.index,
        occurrence.originalStart,
        input.notes ?? null,
        input.flaggedNotes ? 1 : 0,
        now,
        now
      );
      created.push(id);
    }
  });

  insertAll();
  return { seriesId, created };
}
