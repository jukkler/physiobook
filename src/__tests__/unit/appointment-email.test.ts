import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendAppointmentEmail } from "@/lib/appointment-email";

function createDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE patients (
      id text PRIMARY KEY,
      name text NOT NULL,
      email text,
      phone text,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );

    CREATE TABLE appointments (
      id text PRIMARY KEY,
      patient_name text NOT NULL,
      patient_id text,
      start_time integer NOT NULL,
      end_time integer NOT NULL,
      duration_minutes integer NOT NULL,
      status text NOT NULL,
      series_id text,
      notes text,
      flagged_notes integer NOT NULL DEFAULT 0,
      reminder_sent integer NOT NULL DEFAULT 0,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );

    CREATE TABLE settings (
      key text PRIMARY KEY,
      value text NOT NULL
    );
  `);
  return db;
}

describe("sendAppointmentEmail", () => {
  let db: Database.Database;
  const send = vi.fn();
  const start = Date.UTC(2026, 5, 3, 6, 0);

  beforeEach(() => {
    db = createDb();
    send.mockReset();
    send.mockResolvedValue({ ok: true });
  });

  it("sends the custom message to the linked patient email", async () => {
    db.prepare(
      "INSERT INTO patients (id, name, email, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("patient-1", "Dunkel", "patient@example.de", "0170", 1, 1);
    db.prepare(
      `INSERT INTO appointments (
         id, patient_name, patient_id, start_time, end_time, duration_minutes,
         status, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("appt-1", "Dunkel", "patient-1", start, start + 30 * 60_000, 30, "CONFIRMED", "KG <test>", 1, 1);
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "emailSignature",
      "Viele Grüße\n@Name"
    );

    const result = await sendAppointmentEmail({
      db,
      appointmentId: "appt-1",
      subject: "Termin verschoben",
      message: "Hallo Dunkel,\n\nIhr Termin ist bestätigt.\nBitte <antworten>.",
      sendHtmlEmail: send,
      now: () => 123,
    });

    expect(result).toEqual({ ok: true, to: "patient@example.de" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("patient@example.de");
    expect(send.mock.calls[0][1]).toBe("Termin verschoben");
    expect(send.mock.calls[0][2]).toContain("<p>Hallo Dunkel,</p>");
    expect(send.mock.calls[0][2]).toContain("<p>Ihr Termin ist bestätigt.<br>Bitte &lt;antworten&gt;.</p>");
    expect(send.mock.calls[0][2]).toContain("<p>Viele Grüße<br>Dunkel</p>");
  });

  it("returns 404 when appointment is missing", async () => {
    const result = await sendAppointmentEmail({
      db,
      appointmentId: "missing",
      subject: "Termin",
      message: "Nachricht",
      sendHtmlEmail: send,
      now: () => 123,
    });

    expect(result).toEqual({ ok: false, status: 404, error: "Termin nicht gefunden" });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 400 when patient has no email", async () => {
    db.prepare(
      "INSERT INTO patients (id, name, email, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("patient-1", "Dunkel", null, "0170", 1, 1);
    db.prepare(
      `INSERT INTO appointments (
         id, patient_name, patient_id, start_time, end_time, duration_minutes,
         status, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("appt-1", "Dunkel", "patient-1", start, start + 30 * 60_000, 30, "CONFIRMED", null, 1, 1);

    const result = await sendAppointmentEmail({
      db,
      appointmentId: "appt-1",
      subject: "Termin",
      message: "Nachricht",
      sendHtmlEmail: send,
      now: () => 123,
    });

    expect(result).toEqual({ ok: false, status: 400, error: "Für diesen Patienten ist keine E-Mail-Adresse hinterlegt" });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 400 when patient email is invalid", async () => {
    db.prepare(
      "INSERT INTO patients (id, name, email, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("patient-1", "Dunkel", "patient@example.de, 0170", "0170", 1, 1);
    db.prepare(
      `INSERT INTO appointments (
         id, patient_name, patient_id, start_time, end_time, duration_minutes,
         status, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("appt-1", "Dunkel", "patient-1", start, start + 30 * 60_000, 30, "CONFIRMED", null, 1, 1);

    const result = await sendAppointmentEmail({
      db,
      appointmentId: "appt-1",
      subject: "Termin",
      message: "Nachricht",
      sendHtmlEmail: send,
      now: () => 123,
    });

    expect(result).toEqual({ ok: false, status: 400, error: "Für diesen Patienten ist keine gültige E-Mail-Adresse hinterlegt" });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 400 when custom content is missing", async () => {
    const result = await sendAppointmentEmail({
      db,
      appointmentId: "appt-1",
      sendHtmlEmail: send,
      now: () => 123,
    });

    expect(result).toEqual({ ok: false, status: 400, error: "Betreff und Nachricht sind erforderlich" });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns 400 when custom content is blank", async () => {
    const result = await sendAppointmentEmail({
      db,
      appointmentId: "appt-1",
      subject: " ",
      message: "\n",
      sendHtmlEmail: send,
      now: () => 123,
    });

    expect(result).toEqual({ ok: false, status: 400, error: "Betreff und Nachricht dürfen nicht leer sein" });
    expect(send).not.toHaveBeenCalled();
  });
});
