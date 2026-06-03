import type Database from "better-sqlite3";
import { escapeHtml } from "@/lib/html";
import { PRAXIS } from "@/lib/constants";
import {
  EMAIL_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplateKey,
} from "@/lib/email-template-defaults";

export type EmailPlaceholderContext = Partial<Record<
  "Name" | "Datum" | "Uhrzeit" | "Dauer" | "ArchivTyp" | "ArchivTitel" | "ArchivDatum" | "Praxisname",
  string | number
>>;

export interface RenderedEmail {
  subject: string;
  html: string;
}

export function getEmailTemplateSettings(db: Database.Database): Record<EmailTemplateKey, string> {
  const placeholders = EMAIL_TEMPLATE_KEYS.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
    .all(...EMAIL_TEMPLATE_KEYS) as Array<{ key: EmailTemplateKey; value: string }>;

  const result = { ...EMAIL_TEMPLATE_DEFAULTS };
  for (const row of rows) {
    result[row.key] = row.value;
  }

  return result;
}

export function replaceEmailPlaceholders(template: string, context: EmailPlaceholderContext): string {
  const values: EmailPlaceholderContext = {
    Praxisname: PRAXIS.name,
    ...context,
  };

  return template.replace(/@([A-Za-zÄÖÜäöüß]+)/g, (match, key: keyof EmailPlaceholderContext) => {
    const value = values[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function plainTextToEmailHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export function appendSignature(body: string, signature: string): string {
  const trimmedSignature = signature.trim();
  if (!trimmedSignature) return body.trim();
  return `${body.trim()}\n\n${trimmedSignature}`;
}

export function renderEmail({
  subjectTemplate,
  bodyTemplate,
  signatureTemplate,
  context,
}: {
  subjectTemplate: string;
  bodyTemplate: string;
  signatureTemplate: string;
  context: EmailPlaceholderContext;
}): RenderedEmail {
  const subject = replaceEmailPlaceholders(subjectTemplate, context).trim();
  const body = replaceEmailPlaceholders(bodyTemplate, context);
  const signature = replaceEmailPlaceholders(signatureTemplate, context);
  return {
    subject,
    html: plainTextToEmailHtml(appendSignature(body, signature)),
  };
}

export function renderAppointmentDefaultEmail(
  db: Database.Database,
  context: EmailPlaceholderContext
): RenderedEmail {
  const settings = getEmailTemplateSettings(db);
  return renderEmail({
    subjectTemplate: settings.appointmentEmailSubjectTemplate,
    bodyTemplate: settings.appointmentEmailBodyTemplate,
    signatureTemplate: settings.emailSignature,
    context,
  });
}

export function renderReminderEmail(
  db: Database.Database,
  context: EmailPlaceholderContext
): RenderedEmail {
  const settings = getEmailTemplateSettings(db);
  return renderEmail({
    subjectTemplate: settings.reminderEmailSubjectTemplate,
    bodyTemplate: settings.reminderEmailBodyTemplate,
    signatureTemplate: settings.emailSignature,
    context,
  });
}

export function renderArchiveEmail(
  db: Database.Database,
  context: EmailPlaceholderContext
): RenderedEmail {
  const settings = getEmailTemplateSettings(db);
  return renderEmail({
    subjectTemplate: settings.archiveEmailSubjectTemplate,
    bodyTemplate: settings.archiveEmailBodyTemplate,
    signatureTemplate: settings.emailSignature,
    context,
  });
}

export function renderCustomEmailWithSignature(
  db: Database.Database,
  subject: string,
  message: string,
  context: EmailPlaceholderContext
): RenderedEmail {
  const settings = getEmailTemplateSettings(db);
  const signature = replaceEmailPlaceholders(settings.emailSignature, context);
  return {
    subject,
    html: plainTextToEmailHtml(appendSignature(message, signature)),
  };
}
