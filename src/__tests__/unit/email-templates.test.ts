import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  getEmailTemplateSettings,
  renderEmail,
  renderReminderEmail,
} from "@/lib/email-templates";
import { EMAIL_TEMPLATE_DEFAULTS } from "@/lib/email-template-defaults";

function createDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE settings (
      key text PRIMARY KEY,
      value text NOT NULL
    );
  `);
  return db;
}

describe("email templates", () => {
  it("falls back to default templates", () => {
    const db = createDb();
    const settings = getEmailTemplateSettings(db);

    expect(settings.appointmentEmailSubjectTemplate).toBe(
      EMAIL_TEMPLATE_DEFAULTS.appointmentEmailSubjectTemplate
    );
    expect(settings.emailSignature).toBe(EMAIL_TEMPLATE_DEFAULTS.emailSignature);
  });

  it("renders placeholders, escapes html, and appends the signature", () => {
    const rendered = renderEmail({
      subjectTemplate: "Hallo @Name",
      bodyTemplate: "Termin: @Datum\nBitte <antworten>.",
      signatureTemplate: "Viele Grüße\n@Praxisname",
      context: {
        Name: "Dunkel",
        Datum: "03.06.2026",
        Praxisname: "Praxis <Test>",
      },
    });

    expect(rendered.subject).toBe("Hallo Dunkel");
    expect(rendered.html).toContain("Termin: 03.06.2026<br>Bitte &lt;antworten&gt;.");
    expect(rendered.html).toContain("Viele Grüße<br>Praxis &lt;Test&gt;");
  });

  it("uses stored reminder templates", () => {
    const db = createDb();
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "reminderEmailSubjectTemplate",
      "Termin @Datum"
    );
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "reminderEmailBodyTemplate",
      "Hallo @Name um @Uhrzeit"
    );
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "emailSignature",
      "Team @Praxisname"
    );

    const rendered = renderReminderEmail(db, {
      Name: "Dunkel",
      Datum: "03.06.2026",
      Uhrzeit: "08:00",
    });

    expect(rendered.subject).toBe("Termin 03.06.2026");
    expect(rendered.html).toContain("Hallo Dunkel um 08:00");
    expect(rendered.html).toContain("Team Therapiezentrum Ziesemer");
  });
});
