import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createAppointmentSeries } from "@/lib/appointment-series";

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
