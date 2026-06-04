export type EmailTemplateKey =
  | "appointmentEmailSubjectTemplate"
  | "appointmentEmailBodyTemplate"
  | "reminderEmailSubjectTemplate"
  | "reminderEmailBodyTemplate"
  | "archiveEmailSubjectTemplate"
  | "archiveEmailBodyTemplate"
  | "emailSignature";

export type EmailLogoSettingKey = "emailLogoUrl" | "emailLogoWidth";

export const EMAIL_TEMPLATE_KEYS: EmailTemplateKey[] = [
  "appointmentEmailSubjectTemplate",
  "appointmentEmailBodyTemplate",
  "reminderEmailSubjectTemplate",
  "reminderEmailBodyTemplate",
  "archiveEmailSubjectTemplate",
  "archiveEmailBodyTemplate",
  "emailSignature",
];

export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTemplateKey, string> = {
  appointmentEmailSubjectTemplate: "Ihr Termin am @Datum",
  appointmentEmailBodyTemplate: `Hallo @Name,

hiermit senden wir Ihnen Ihre Termininformation:

@Datum
@Uhrzeit Uhr
@Dauer Minuten

Falls Sie den Termin nicht wahrnehmen können, melden Sie sich bitte rechtzeitig in der Praxis.`,
  reminderEmailSubjectTemplate: "Erinnerung: Ihr Termin am @Datum",
  reminderEmailBodyTemplate: `Hallo @Name,

wir möchten Sie an Ihren Termin erinnern:

@Datum um @Uhrzeit Uhr
Dauer: @Dauer Minuten

Wir freuen uns auf Ihren Besuch!`,
  archiveEmailSubjectTemplate: "@ArchivTitel",
  archiveEmailBodyTemplate: `Hallo,

im Anhang finden Sie das @ArchivTyp.

Archiv: @ArchivTitel`,
  emailSignature: `Viele Grüße
@Praxisname`,
};

export const EMAIL_LOGO_SETTING_KEYS: EmailLogoSettingKey[] = [
  "emailLogoUrl",
  "emailLogoWidth",
];

export const EMAIL_LOGO_DEFAULTS: Record<EmailLogoSettingKey, string> = {
  emailLogoUrl: "",
  emailLogoWidth: "360",
};

export const EMAIL_PLACEHOLDERS = [
  { token: "@Name", description: "Name des Patienten" },
  { token: "@Datum", description: "Datum des Termins" },
  { token: "@Uhrzeit", description: "Uhrzeit des Termins" },
  { token: "@Dauer", description: "Dauer des Termins in Minuten" },
  { token: "@ArchivTyp", description: "Wochenarchiv, Monatsarchiv oder Jahresarchiv" },
  { token: "@ArchivTitel", description: "Titel des erzeugten Archivs" },
  { token: "@ArchivDatum", description: "Bezugsdatum des Archivs" },
  { token: "@Praxisname", description: "Name der Praxis" },
  { token: "@Praxisadresse", description: "Adresse der Praxis" },
  { token: "@Praxistelefon", description: "Telefonnummer der Praxis" },
  { token: "@Logo", description: "E-Mail-Logo aus der gespeicherten Logo-URL" },
];
