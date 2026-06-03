import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createAppointmentSeries, deleteAppointmentSeriesScope, updateAppointmentSeriesScope } from "@/lib/appointment-series";

function createTestDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE patients (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      email text,
      phone text,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
    CREATE TABLE blockers (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      start_time integer NOT NULL,
      end_time integer NOT NULL,
      blocker_group_id text,
      created_at integer NOT NULL
    );
    CREATE TABLE appointment_series (
      id text PRIMARY KEY NOT NULL,
      patient_id text,
      patient_name text NOT NULL,
      first_start_time integer NOT NULL,
      duration_minutes integer NOT NULL,
      interval_weeks integer NOT NULL,
      occurrence_count integer NOT NULL,
      last_start_time integer NOT NULL,
      status text NOT NULL DEFAULT 'ACTIVE',
      notes text,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
    CREATE TABLE appointments (
      id text PRIMARY KEY NOT NULL,
      patient_name text NOT NULL,
      patient_id text,
      start_time integer NOT NULL,
      end_time integer NOT NULL,
      duration_minutes integer NOT NULL,
      status text NOT NULL,
      series_id text,
      series_occurrence_index integer,
      series_original_start_time integer,
      series_exception_type text,
      notes text,
      flagged_notes integer DEFAULT 0 NOT NULL,
      reminder_sent integer DEFAULT 0 NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
  `);
  return db;
}

describe("createAppointmentSeries", () => {
  it("creates a series row and materialized appointment occurrences", () => {
    const db = createTestDb();
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    const result = createAppointmentSeries(
      {
        patientName: "Ada Lovelace",
        patientId: "patient-1",
        startTime: start,
        durationMinutes: 30,
        status: "CONFIRMED",
        notes: "KG",
        intervalWeeks: 2,
        count: 3,
        force: false,
      },
      {
        db,
        now: () => 1_800_000_000_000,
        uuid: (() => {
          const ids = ["series-1", "appt-1", "appt-2", "appt-3"];
          return () => ids.shift()!;
        })(),
        syncPatient: () => "patient-1",
        updatePatientContact: () => undefined,
      }
    );

    expect(result).toEqual({ seriesId: "series-1", created: ["appt-1", "appt-2", "appt-3"] });
    expect(db.prepare("SELECT id, interval_weeks, occurrence_count FROM appointment_series").all()).toEqual([
      { id: "series-1", interval_weeks: 2, occurrence_count: 3 },
    ]);
    expect(db.prepare("SELECT id, series_id, series_occurrence_index, start_time, series_original_start_time FROM appointments ORDER BY series_occurrence_index").all()).toEqual([
      { id: "appt-1", series_id: "series-1", series_occurrence_index: 0, start_time: start, series_original_start_time: start },
      { id: "appt-2", series_id: "series-1", series_occurrence_index: 1, start_time: start + 14 * 86_400_000, series_original_start_time: start + 14 * 86_400_000 },
      { id: "appt-3", series_id: "series-1", series_occurrence_index: 2, start_time: start + 28 * 86_400_000, series_original_start_time: start + 28 * 86_400_000 },
    ]);
  });

  it("rejects appointment conflicts unless force is true", () => {
    const db = createTestDb();
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    db.prepare(`
      INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, created_at, updated_at)
      VALUES ('existing', 'Existing', ?, ?, 30, 'CONFIRMED', 1, 1)
    `).run(start + 14 * 86_400_000, start + 14 * 86_400_000 + 30 * 60_000);

    expect(() => createAppointmentSeries(
      {
        patientName: "Ada Lovelace",
        startTime: start,
        durationMinutes: 30,
        status: "CONFIRMED",
        intervalWeeks: 2,
        count: 3,
        force: false,
      },
      {
        db,
        now: () => 1_800_000_000_000,
        uuid: () => "unused",
        syncPatient: () => "patient-1",
        updatePatientContact: () => undefined,
      }
    )).toThrow("Zeitkonflikt: 1 Konflikte gefunden");

    const result = createAppointmentSeries(
      {
        patientName: "Ada Lovelace",
        startTime: start,
        durationMinutes: 30,
        status: "CONFIRMED",
        intervalWeeks: 2,
        count: 3,
        force: true,
      },
      {
        db,
        now: () => 1_800_000_000_000,
        uuid: (() => {
          const ids = ["series-forced", "appt-forced-1", "appt-forced-2", "appt-forced-3"];
          return () => ids.shift()!;
        })(),
        syncPatient: () => "patient-1",
        updatePatientContact: () => undefined,
      }
    );

    expect(result).toEqual({
      seriesId: "series-forced",
      created: ["appt-forced-1", "appt-forced-2", "appt-forced-3"],
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM appointments").get()).toEqual({ count: 4 });
  });
});

function seedSeries(db: Database.Database, start: number) {
  db.prepare(`
    INSERT INTO appointment_series (
      id, patient_id, patient_name, first_start_time, duration_minutes, interval_weeks,
      occurrence_count, last_start_time, status, notes, created_at, updated_at
    )
    VALUES ('series-1', 'patient-1', 'Ada Lovelace', ?, 30, 1, 4, ?, 'ACTIVE', 'KG', 1, 1)
  `).run(start, start + 21 * 86_400_000);

  const insert = db.prepare(`
    INSERT INTO appointments (
      id, patient_name, patient_id, start_time, end_time, duration_minutes, status, series_id,
      series_occurrence_index, series_original_start_time, notes, flagged_notes, reminder_sent, created_at, updated_at
    )
    VALUES (?, 'Ada Lovelace', 'patient-1', ?, ?, 30, 'CONFIRMED', 'series-1', ?, ?, 'KG', 0, 0, 1, 1)
  `);

  for (let index = 0; index < 4; index++) {
    const occurrenceStart = start + index * 7 * 86_400_000;
    insert.run(`appt-${index}`, occurrenceStart, occurrenceStart + 30 * 60_000, index, occurrenceStart);
  }
}

describe("updateAppointmentSeriesScope", () => {
  it("marks a single moved occurrence without shifting the whole series", () => {
    const db = createTestDb();
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    seedSeries(db, start);

    updateAppointmentSeriesScope(
      "appt-1",
      "single",
      { startTime: start + 7 * 86_400_000 + 60 * 60_000, durationMinutes: 45 },
      { db, now: () => 2, uuid: () => "unused", syncPatient: () => "patient-1", updatePatientContact: () => undefined }
    );

    expect(db.prepare("SELECT start_time, duration_minutes, series_exception_type FROM appointments WHERE id = 'appt-1'").get()).toEqual({
      start_time: start + 7 * 86_400_000 + 60 * 60_000,
      duration_minutes: 45,
      series_exception_type: "moved",
    });
    expect(db.prepare("SELECT start_time FROM appointments WHERE id = 'appt-2'").get()).toEqual({
      start_time: start + 14 * 86_400_000,
    });
  });

  it("rejects a conflicting single moved occurrence unless force is true", () => {
    const db = createTestDb();
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    const movedStart = start + 7 * 86_400_000 + 60 * 60_000;
    seedSeries(db, start);

    db.prepare(`
      INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, created_at, updated_at)
      VALUES ('outside-single', 'Grace Hopper', ?, ?, 30, 'CONFIRMED', 1, 1)
    `).run(movedStart + 15 * 60_000, movedStart + 45 * 60_000);

    const deps = { db, now: () => 2, uuid: () => "unused", syncPatient: () => "patient-1", updatePatientContact: () => undefined };

    expect(() => updateAppointmentSeriesScope(
      "appt-1",
      "single",
      { startTime: movedStart, durationMinutes: 45 },
      deps
    )).toThrow("Zeitkonflikt: 1 Konflikte gefunden");

    updateAppointmentSeriesScope(
      "appt-1",
      "single",
      { startTime: movedStart, durationMinutes: 45, force: true },
      deps
    );

    expect(db.prepare("SELECT start_time, duration_minutes FROM appointments WHERE id = 'appt-1'").get()).toEqual({
      start_time: movedStart,
      duration_minutes: 45,
    });
  });

  it("rejects a conflicting single status activation unless force is true", () => {
    const db = createTestDb();
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    const deps = { db, now: () => 2, uuid: () => "unused", syncPatient: () => "patient-1", updatePatientContact: () => undefined };

    db.prepare(`
      INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, created_at, updated_at)
      VALUES ('cancelled-single', 'Ada Lovelace', ?, ?, 30, 'CANCELLED', 1, 1)
    `).run(start, start + 30 * 60_000);
    db.prepare(`
      INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, created_at, updated_at)
      VALUES ('outside-single', 'Grace Hopper', ?, ?, 30, 'CONFIRMED', 1, 1)
    `).run(start + 10 * 60_000, start + 40 * 60_000);

    expect(() => updateAppointmentSeriesScope(
      "cancelled-single",
      "single",
      { status: "CONFIRMED" },
      deps
    )).toThrow("Zeitkonflikt: 1 Konflikte gefunden");

    expect(db.prepare("SELECT status FROM appointments WHERE id = 'cancelled-single'").get()).toEqual({
      status: "CANCELLED",
    });

    updateAppointmentSeriesScope(
      "cancelled-single",
      "single",
      { status: "CONFIRMED", force: true },
      deps
    );

    expect(db.prepare("SELECT status FROM appointments WHERE id = 'cancelled-single'").get()).toEqual({
      status: "CONFIRMED",
    });
  });

  it("rejects a conflicting series status activation unless force is true", () => {
    const db = createTestDb();
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    seedSeries(db, start);
    db.prepare("UPDATE appointments SET status = 'CANCELLED'").run();
    db.prepare(`
      INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, created_at, updated_at)
      VALUES ('outside-series', 'Grace Hopper', ?, ?, 30, 'CONFIRMED', 1, 1)
    `).run(start + 14 * 86_400_000 + 10 * 60_000, start + 14 * 86_400_000 + 40 * 60_000);

    const deps = { db, now: () => 2, uuid: () => "unused", syncPatient: () => "patient-1", updatePatientContact: () => undefined };

    expect(() => updateAppointmentSeriesScope(
      "appt-0",
      "series",
      { status: "CONFIRMED" },
      deps
    )).toThrow("Zeitkonflikt: 1 Konflikte gefunden");

    expect(db.prepare("SELECT DISTINCT status FROM appointments WHERE series_id = 'series-1'").all()).toEqual([
      { status: "CANCELLED" },
    ]);

    updateAppointmentSeriesScope(
      "appt-0",
      "series",
      { status: "CONFIRMED", force: true },
      deps
    );

    expect(db.prepare("SELECT COUNT(*) as count FROM appointments WHERE series_id = 'series-1' AND status = 'CONFIRMED'").get()).toEqual({
      count: 4,
    });
  });

  it("splits future occurrences into a new series before applying future changes", () => {
    const db = createTestDb();
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    seedSeries(db, start);

    updateAppointmentSeriesScope(
      "appt-2",
      "future",
      { startTime: start + 14 * 86_400_000 + 60 * 60_000 },
      { db, now: () => 2, uuid: () => "series-2", syncPatient: () => "patient-1", updatePatientContact: () => undefined }
    );

    expect(db.prepare("SELECT id, occurrence_count FROM appointment_series ORDER BY id").all()).toEqual([
      { id: "series-1", occurrence_count: 2 },
      { id: "series-2", occurrence_count: 2 },
    ]);
    expect(db.prepare("SELECT id, series_id, series_occurrence_index, start_time FROM appointments ORDER BY id").all()).toEqual([
      { id: "appt-0", series_id: "series-1", series_occurrence_index: 0, start_time: start },
      { id: "appt-1", series_id: "series-1", series_occurrence_index: 1, start_time: start + 7 * 86_400_000 },
      { id: "appt-2", series_id: "series-2", series_occurrence_index: 0, start_time: start + 14 * 86_400_000 + 60 * 60_000 },
      { id: "appt-3", series_id: "series-2", series_occurrence_index: 1, start_time: start + 21 * 86_400_000 + 60 * 60_000 },
    ]);
  });

  it("rejects a conflicting future shift outside the updated set unless force is true", () => {
    const db = createTestDb();
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    const shiftedStart = start + 21 * 86_400_000 + 60 * 60_000;
    seedSeries(db, start);

    db.prepare(`
      INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, created_at, updated_at)
      VALUES ('outside-future', 'Grace Hopper', ?, ?, 30, 'REQUESTED', 1, 1)
    `).run(shiftedStart + 10 * 60_000, shiftedStart + 40 * 60_000);

    expect(() => updateAppointmentSeriesScope(
      "appt-2",
      "future",
      { startTime: start + 14 * 86_400_000 + 60 * 60_000 },
      { db, now: () => 2, uuid: () => "series-2", syncPatient: () => "patient-1", updatePatientContact: () => undefined }
    )).toThrow("Zeitkonflikt: 1 Konflikte gefunden");

    expect(db.prepare("SELECT COUNT(*) as count FROM appointment_series").get()).toEqual({ count: 1 });

    updateAppointmentSeriesScope(
      "appt-2",
      "future",
      { startTime: start + 14 * 86_400_000 + 60 * 60_000, force: true },
      { db, now: () => 2, uuid: () => "series-2", syncPatient: () => "patient-1", updatePatientContact: () => undefined }
    );

    expect(db.prepare("SELECT id, series_id, start_time FROM appointments WHERE id IN ('appt-2', 'appt-3') ORDER BY id").all()).toEqual([
      { id: "appt-2", series_id: "series-2", start_time: start + 14 * 86_400_000 + 60 * 60_000 },
      { id: "appt-3", series_id: "series-2", start_time: shiftedStart },
    ]);
  });

  it("rolls back a future split when the update phase fails", () => {
    const db = createTestDb();
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    seedSeries(db, start);
    const deps = { db, now: () => 2, uuid: () => "series-2", syncPatient: () => "patient-1", updatePatientContact: () => undefined };

    const originalAppointments = db.prepare(`
      SELECT id, series_id, series_occurrence_index
      FROM appointments
      ORDER BY id
    `).all();
    const originalSeries = db.prepare(`
      SELECT id, occurrence_count
      FROM appointment_series
      ORDER BY id
    `).all();

    db.exec(`
      CREATE TRIGGER fail_future_status_update
      BEFORE UPDATE OF status ON appointments
      WHEN NEW.status = 'EXPIRED'
      BEGIN
        SELECT RAISE(ABORT, 'forced appointment update failure');
      END;
    `);

    expect(() => updateAppointmentSeriesScope(
      "appt-2",
      "future",
      { status: "EXPIRED" },
      deps
    )).toThrow("forced appointment update failure");

    expect(db.prepare(`
      SELECT id, series_id, series_occurrence_index
      FROM appointments
      ORDER BY id
    `).all()).toEqual(originalAppointments);
    expect(db.prepare(`
      SELECT id, occurrence_count
      FROM appointment_series
      ORDER BY id
    `).all()).toEqual(originalSeries);
  });
});

describe("deleteAppointmentSeriesScope", () => {
  it("deletes a single occurrence only", () => {
    const db = createTestDb();
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    seedSeries(db, start);

    deleteAppointmentSeriesScope("appt-1", "single", { db, now: () => 2, uuid: () => "unused", syncPatient: () => "patient-1", updatePatientContact: () => undefined });

    expect(db.prepare("SELECT COUNT(*) as count FROM appointments").get()).toEqual({ count: 3 });
    expect(db.prepare("SELECT COUNT(*) as count FROM appointment_series").get()).toEqual({ count: 1 });
  });

  it("deletes selected and later occurrences for future scope", () => {
    const db = createTestDb();
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    seedSeries(db, start);

    deleteAppointmentSeriesScope("appt-2", "future", { db, now: () => 2, uuid: () => "unused", syncPatient: () => "patient-1", updatePatientContact: () => undefined });

    expect(db.prepare("SELECT id FROM appointments ORDER BY id").all()).toEqual([{ id: "appt-0" }, { id: "appt-1" }]);
    expect(db.prepare("SELECT occurrence_count FROM appointment_series WHERE id = 'series-1'").get()).toEqual({ occurrence_count: 2 });
  });
});
