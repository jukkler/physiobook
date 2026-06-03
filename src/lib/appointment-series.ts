import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import type { AppointmentSeriesScope } from "@/lib/db/schema";
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

export interface UpdateAppointmentSeriesInput {
  patientName?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  startTime?: number;
  durationMinutes?: number;
  status?: string;
  notes?: string | null;
  flaggedNotes?: boolean;
  force?: boolean;
}

interface SeriesAppointmentRow {
  id: string;
  patient_name: string;
  patient_id: string | null;
  start_time: number;
  end_time: number;
  duration_minutes: number;
  status: string;
  series_id: string | null;
  series_occurrence_index: number | null;
  series_original_start_time: number | null;
  series_exception_type: string | null;
  notes: string | null;
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

function getAppointmentOrThrow(db: Database.Database, id: string): SeriesAppointmentRow {
  const row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id) as SeriesAppointmentRow | undefined;
  if (!row) throw new Error("Termin nicht gefunden");
  return row;
}

function splitFutureOccurrences(
  selected: SeriesAppointmentRow,
  deps: AppointmentSeriesServiceDeps
): string {
  if (!selected.series_id || selected.series_occurrence_index === null) throw new Error("Termin gehört zu keiner Serie");
  if (selected.series_occurrence_index === 0) return selected.series_id;

  const now = deps.now();
  const newSeriesId = deps.uuid();
  const futureRows = deps.db.prepare(`
    SELECT *
    FROM appointments
    WHERE series_id = ?
      AND series_occurrence_index >= ?
    ORDER BY series_occurrence_index ASC
  `).all(selected.series_id, selected.series_occurrence_index) as SeriesAppointmentRow[];

  const firstFuture = futureRows[0];
  const lastFuture = futureRows[futureRows.length - 1];
  const originalSeries = deps.db.prepare("SELECT * FROM appointment_series WHERE id = ?").get(selected.series_id) as Record<string, unknown>;

  deps.db.prepare(`
    INSERT INTO appointment_series (
      id, patient_id, patient_name, first_start_time, duration_minutes, interval_weeks,
      occurrence_count, last_start_time, status, notes, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
  `).run(
    newSeriesId,
    firstFuture.patient_id,
    firstFuture.patient_name,
    firstFuture.start_time,
    firstFuture.duration_minutes,
    originalSeries.interval_weeks,
    futureRows.length,
    lastFuture.start_time,
    originalSeries.notes,
    now,
    now
  );

  for (let index = 0; index < futureRows.length; index++) {
    deps.db.prepare(`
      UPDATE appointments
      SET series_id = ?, series_occurrence_index = ?, updated_at = ?
      WHERE id = ?
    `).run(newSeriesId, index, now, futureRows[index].id);
  }

  deps.db.prepare(`
    UPDATE appointment_series
    SET occurrence_count = ?, last_start_time = (
      SELECT MAX(start_time) FROM appointments WHERE series_id = ?
    ), updated_at = ?
    WHERE id = ?
  `).run(selected.series_occurrence_index, selected.series_id, now, selected.series_id);

  return newSeriesId;
}

export function updateAppointmentSeriesScope(
  appointmentId: string,
  scope: AppointmentSeriesScope,
  input: UpdateAppointmentSeriesInput,
  deps: AppointmentSeriesServiceDeps = defaultAppointmentSeriesDeps()
): void {
  const selected = getAppointmentOrThrow(deps.db, appointmentId);
  const now = deps.now();

  if (scope === "single" || !selected.series_id) {
    const newStart = input.startTime ?? selected.start_time;
    const newDuration = input.durationMinutes ?? selected.duration_minutes;
    const newEnd = newStart + newDuration * 60_000;
    const moved = newStart !== selected.start_time || newDuration !== selected.duration_minutes;
    const exceptionType = moved ? "moved" : selected.series_exception_type;
    const patientId = input.patientName && input.patientName !== selected.patient_name
      ? deps.syncPatient(input.patientName, input.contactEmail ?? null, input.contactPhone ?? null, now)
      : selected.patient_id;

    if (patientId && (input.contactEmail !== undefined || input.contactPhone !== undefined)) {
      deps.updatePatientContact(patientId, input.contactEmail, input.contactPhone, now);
    }

    deps.db.prepare(`
      UPDATE appointments SET
        patient_name = COALESCE(?, patient_name),
        patient_id = COALESCE(?, patient_id),
        start_time = ?,
        end_time = ?,
        duration_minutes = ?,
        status = COALESCE(?, status),
        notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
        flagged_notes = CASE WHEN ? = 1 THEN ? ELSE flagged_notes END,
        reminder_sent = CASE WHEN ? = 1 THEN 0 ELSE reminder_sent END,
        series_exception_type = COALESCE(?, series_exception_type),
        updated_at = ?
      WHERE id = ?
    `).run(
      input.patientName ?? null,
      patientId,
      newStart,
      newEnd,
      newDuration,
      input.status ?? null,
      input.notes !== undefined ? 1 : 0,
      input.notes ?? null,
      input.flaggedNotes !== undefined ? 1 : 0,
      input.flaggedNotes ? 1 : 0,
      moved ? 1 : 0,
      exceptionType,
      now,
      appointmentId
    );
    return;
  }

  const targetSeriesId = scope === "future" ? deps.db.transaction(() => splitFutureOccurrences(selected, deps))() : selected.series_id;
  const anchor = scope === "future" ? getAppointmentOrThrow(deps.db, appointmentId) : selected;
  const timeDelta = input.startTime ? input.startTime - anchor.start_time : 0;
  const rows = deps.db.prepare(`
    SELECT *
    FROM appointments
    WHERE series_id = ?
    ORDER BY series_occurrence_index ASC
  `).all(targetSeriesId) as SeriesAppointmentRow[];

  const patientId = input.patientName && input.patientName !== anchor.patient_name
    ? deps.syncPatient(input.patientName, input.contactEmail ?? null, input.contactPhone ?? null, now)
    : anchor.patient_id;

  if (patientId && (input.contactEmail !== undefined || input.contactPhone !== undefined)) {
    deps.updatePatientContact(patientId, input.contactEmail, input.contactPhone, now);
  }

  const updateAll = deps.db.transaction(() => {
    for (const row of rows) {
      const newStart = row.start_time + timeDelta;
      const newDuration = input.durationMinutes ?? row.duration_minutes;
      deps.db.prepare(`
        UPDATE appointments SET
          patient_name = COALESCE(?, patient_name),
          patient_id = COALESCE(?, patient_id),
          start_time = ?,
          end_time = ?,
          duration_minutes = ?,
          status = COALESCE(?, status),
          notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
          flagged_notes = CASE WHEN ? = 1 THEN ? ELSE flagged_notes END,
          reminder_sent = CASE WHEN ? = 1 THEN 0 ELSE reminder_sent END,
          updated_at = ?
        WHERE id = ?
      `).run(
        input.patientName ?? null,
        patientId,
        newStart,
        newStart + newDuration * 60_000,
        newDuration,
        input.status ?? null,
        input.notes !== undefined ? 1 : 0,
        input.notes ?? null,
        input.flaggedNotes !== undefined ? 1 : 0,
        input.flaggedNotes ? 1 : 0,
        timeDelta !== 0 || input.durationMinutes ? 1 : 0,
        now,
        row.id
      );
    }

    const summary = deps.db.prepare(`
      SELECT MIN(start_time) as firstStartTime, MAX(start_time) as lastStartTime, COUNT(*) as occurrenceCount
      FROM appointments
      WHERE series_id = ?
    `).get(targetSeriesId) as { firstStartTime: number; lastStartTime: number; occurrenceCount: number };

    deps.db.prepare(`
      UPDATE appointment_series SET
        patient_name = COALESCE(?, patient_name),
        patient_id = COALESCE(?, patient_id),
        first_start_time = ?,
        duration_minutes = COALESCE(?, duration_minutes),
        occurrence_count = ?,
        last_start_time = ?,
        notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.patientName ?? null,
      patientId,
      summary.firstStartTime,
      input.durationMinutes ?? null,
      summary.occurrenceCount,
      summary.lastStartTime,
      input.notes !== undefined ? 1 : 0,
      input.notes ?? null,
      now,
      targetSeriesId
    );
  });

  updateAll();
}

export function deleteAppointmentSeriesScope(
  appointmentId: string,
  scope: AppointmentSeriesScope,
  deps: AppointmentSeriesServiceDeps = defaultAppointmentSeriesDeps()
): void {
  const selected = getAppointmentOrThrow(deps.db, appointmentId);

  if (scope === "single" || !selected.series_id) {
    deps.db.prepare("DELETE FROM appointments WHERE id = ?").run(appointmentId);
    return;
  }

  if (scope === "series") {
    const deleteAll = deps.db.transaction(() => {
      deps.db.prepare("DELETE FROM appointments WHERE series_id = ?").run(selected.series_id);
      deps.db.prepare("DELETE FROM appointment_series WHERE id = ?").run(selected.series_id);
    });
    deleteAll();
    return;
  }

  if (selected.series_occurrence_index === null) throw new Error("Termin gehört zu keiner Serie");
  const deleteFuture = deps.db.transaction(() => {
    deps.db.prepare(`
      DELETE FROM appointments
      WHERE series_id = ?
        AND series_occurrence_index >= ?
    `).run(selected.series_id, selected.series_occurrence_index);

    const remaining = deps.db.prepare(`
      SELECT COUNT(*) as count, MAX(start_time) as lastStartTime
      FROM appointments
      WHERE series_id = ?
    `).get(selected.series_id) as { count: number; lastStartTime: number | null };

    if (remaining.count === 0) {
      deps.db.prepare("DELETE FROM appointment_series WHERE id = ?").run(selected.series_id);
    } else {
      deps.db.prepare(`
        UPDATE appointment_series
        SET occurrence_count = ?, last_start_time = ?, updated_at = ?
        WHERE id = ?
      `).run(remaining.count, remaining.lastStartTime, deps.now(), selected.series_id);
    }
  });
  deleteFuture();
}
