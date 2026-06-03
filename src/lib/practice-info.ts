import type Database from "better-sqlite3";
import { PRAXIS } from "@/lib/constants";

export interface PracticeInfo {
  name: string;
  address: string;
  phone: string;
}

export const PRACTICE_INFO_KEYS = ["practiceName", "practiceAddress", "practicePhone"] as const;

export const PRACTICE_INFO_DEFAULTS: Record<(typeof PRACTICE_INFO_KEYS)[number], string> = {
  practiceName: PRAXIS.name,
  practiceAddress: PRAXIS.address,
  practicePhone: PRAXIS.phone,
};

export function getPracticeInfo(db: Database.Database): PracticeInfo {
  const rows = db
    .prepare("SELECT key, value FROM settings WHERE key IN ('practiceName', 'practiceAddress', 'practicePhone')")
    .all() as Array<{ key: string; value: string }>;

  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;

  return {
    name: settings.practiceName || PRACTICE_INFO_DEFAULTS.practiceName,
    address: settings.practiceAddress || PRACTICE_INFO_DEFAULTS.practiceAddress,
    phone: settings.practicePhone || PRACTICE_INFO_DEFAULTS.practicePhone,
  };
}
