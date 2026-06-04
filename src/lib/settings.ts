// src/lib/settings.ts
import { getDb } from "@/lib/db";
import { EMAIL_LOGO_DEFAULTS, EMAIL_TEMPLATE_DEFAULTS } from "@/lib/email-template-defaults";
import { PRACTICE_INFO_DEFAULTS } from "@/lib/practice-info";

type SettingKey = string;

const DEFAULTS: Record<string, string> = {
  morningStart: "08:00",
  morningEnd: "13:00",
  afternoonStart: "13:00",
  afternoonEnd: "20:00",
  slotDuration: "30",
  requestTimeoutHours: "48",
  retentionDaysExpired: "30",
  retentionDaysPast: "90",
  ...PRACTICE_INFO_DEFAULTS,
  ...EMAIL_TEMPLATE_DEFAULTS,
  ...EMAIL_LOGO_DEFAULTS,
};

/**
 * Load one or more settings by key from the database.
 * Falls back to defaults for missing keys.
 */
export function getSettings(keys: SettingKey[]): Record<string, string> {
  const db = getDb();
  const placeholders = keys.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
    .all(...keys) as Array<{ key: string; value: string }>;

  const result: Record<string, string> = {};
  for (const key of keys) {
    const row = rows.find((r) => r.key === key);
    result[key] = row?.value ?? DEFAULTS[key] ?? "";
  }
  return result;
}

/**
 * Load a single setting by key.
 */
export function getSetting(key: SettingKey): string {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? DEFAULTS[key] ?? "";
}
