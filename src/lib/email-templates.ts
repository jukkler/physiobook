import type Database from "better-sqlite3";
import { escapeHtml } from "@/lib/html";
import { getPracticeInfo } from "@/lib/practice-info";
import {
  EMAIL_LOGO_DEFAULTS,
  EMAIL_LOGO_SETTING_KEYS,
  EMAIL_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplateKey,
} from "@/lib/email-template-defaults";

const LOGO_MARKER = "PHYSIOBOOK_EMAIL_LOGO_MARKER";

export type EmailPlaceholderContext = Partial<Record<
  "Name" | "Datum" | "Uhrzeit" | "Dauer" | "ArchivTyp" | "ArchivTitel" | "ArchivDatum" | "Praxisname" | "Praxisadresse" | "Praxistelefon",
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

function getLogoSettings(db: Database.Database): { url: string; width: number } {
  const rows = db
    .prepare("SELECT key, value FROM settings WHERE key IN ('emailLogoUrl', 'emailLogoWidth')")
    .all() as Array<{ key: string; value: string }>;

  const settings = { ...EMAIL_LOGO_DEFAULTS };
  for (const row of rows) {
    if (EMAIL_LOGO_SETTING_KEYS.includes(row.key as (typeof EMAIL_LOGO_SETTING_KEYS)[number])) {
      settings[row.key as keyof typeof settings] = row.value;
    }
  }

  const parsedWidth = Number(settings.emailLogoWidth);
  return {
    url: settings.emailLogoUrl,
    width: Number.isInteger(parsedWidth) && parsedWidth >= 120 && parsedWidth <= 600
      ? parsedWidth
      : Number(EMAIL_LOGO_DEFAULTS.emailLogoWidth),
  };
}

function buildLogoHtml(db: Database.Database): string {
  const logo = getLogoSettings(db);
  if (!logo.url) return "";

  let parsed: URL;
  try {
    parsed = new URL(logo.url);
  } catch {
    return "";
  }

  if (parsed.protocol !== "https:") return "";

  const escapedUrl = escapeHtml(parsed.toString());
  return `<img src="${escapedUrl}" alt="Praxislogo" width="${logo.width}" style="display:block; max-width:100%; height:auto; margin-top:12px;">`;
}

export function replaceEmailPlaceholders(template: string, context: EmailPlaceholderContext): string {
  const values: EmailPlaceholderContext = {
    ...context,
  };

  return template.replace(/@([A-Za-zÄÖÜäöüß]+)/g, (match, key: keyof EmailPlaceholderContext) => {
    const value = values[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function plainTextToEmailHtml(text: string, logoHtml = ""): string {
  return text
    .replace(/@Logo/g, logoHtml ? LOGO_MARKER : "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) =>
      `<p>${escapeHtml(paragraph)
        .replace(new RegExp(LOGO_MARKER, "g"), logoHtml)
        .replace(/\n/g, "<br>")}</p>`
    )
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
  logoHtml = "",
}: {
  subjectTemplate: string;
  bodyTemplate: string;
  signatureTemplate: string;
  context: EmailPlaceholderContext;
  logoHtml?: string;
}): RenderedEmail {
  const subject = replaceEmailPlaceholders(subjectTemplate, context).replace(/@Logo/g, "").trim();
  const body = replaceEmailPlaceholders(bodyTemplate, context);
  const signature = replaceEmailPlaceholders(signatureTemplate, context);
  return {
    subject,
    html: plainTextToEmailHtml(appendSignature(body, signature), logoHtml),
  };
}

function withPracticeContext(db: Database.Database, context: EmailPlaceholderContext): EmailPlaceholderContext {
  const practice = getPracticeInfo(db);
  return {
    Praxisname: practice.name,
    Praxisadresse: practice.address,
    Praxistelefon: practice.phone,
    ...context,
  };
}

export function renderAppointmentDefaultEmail(
  db: Database.Database,
  context: EmailPlaceholderContext
): RenderedEmail {
  const settings = getEmailTemplateSettings(db);
  const fullContext = withPracticeContext(db, context);
  const logoHtml = buildLogoHtml(db);
  return renderEmail({
    subjectTemplate: settings.appointmentEmailSubjectTemplate,
    bodyTemplate: settings.appointmentEmailBodyTemplate,
    signatureTemplate: settings.emailSignature,
    context: fullContext,
    logoHtml,
  });
}

export function renderReminderEmail(
  db: Database.Database,
  context: EmailPlaceholderContext
): RenderedEmail {
  const settings = getEmailTemplateSettings(db);
  const fullContext = withPracticeContext(db, context);
  const logoHtml = buildLogoHtml(db);
  return renderEmail({
    subjectTemplate: settings.reminderEmailSubjectTemplate,
    bodyTemplate: settings.reminderEmailBodyTemplate,
    signatureTemplate: settings.emailSignature,
    context: fullContext,
    logoHtml,
  });
}

export function renderArchiveEmail(
  db: Database.Database,
  context: EmailPlaceholderContext
): RenderedEmail {
  const settings = getEmailTemplateSettings(db);
  const fullContext = withPracticeContext(db, context);
  const logoHtml = buildLogoHtml(db);
  return renderEmail({
    subjectTemplate: settings.archiveEmailSubjectTemplate,
    bodyTemplate: settings.archiveEmailBodyTemplate,
    signatureTemplate: settings.emailSignature,
    context: fullContext,
    logoHtml,
  });
}

export function renderCustomEmailWithSignature(
  db: Database.Database,
  subject: string,
  message: string,
  context: EmailPlaceholderContext
): RenderedEmail {
  const settings = getEmailTemplateSettings(db);
  const fullContext = withPracticeContext(db, context);
  const signature = replaceEmailPlaceholders(settings.emailSignature, fullContext);
  const logoHtml = buildLogoHtml(db);
  return {
    subject: subject.replace(/@Logo/g, "").trim(),
    html: plainTextToEmailHtml(appendSignature(message, signature), logoHtml),
  };
}
