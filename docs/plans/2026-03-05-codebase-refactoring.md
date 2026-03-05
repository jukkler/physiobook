# PhysioBook Codebase Refactoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate all code duplication, unify the type system around Drizzle schema, decompose monolithic components, and extract shared UI/backend abstractions.

**Architecture:** Extract duplicated logic into focused lib modules (`html.ts`, `validation.ts`, `settings.ts`, `patients.ts`, `cron/`). Add a Drizzle singleton to `db/index.ts`. Create shared UI primitives (`Modal`, `Toggle`, `StatusMessage`). Decompose `VerwaltungClient` into 5 panels and extract inline modals from `DashboardClient`. Delete `types/models.ts` and use schema-derived types everywhere.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + better-sqlite3, React 19, Tailwind CSS 4, Vitest

---

## Phase 1: Leaf Utility Modules (no existing code depends on these)

### Task 1: Create `src/lib/html.ts`

**Files:**
- Create: `src/lib/html.ts`
- Test: `src/__tests__/unit/html.test.ts`

**Step 1: Write the test**

```typescript
// src/__tests__/unit/html.test.ts
import { describe, it, expect } from "vitest";
import { escapeHtml } from "@/lib/html";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapes angle brackets and quotes", () => {
    expect(escapeHtml('<script>"alert"</script>')).toBe(
      "&lt;script&gt;&quot;alert&quot;&lt;/script&gt;"
    );
  });

  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("leaves safe text unchanged", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/html.test.ts`
Expected: FAIL — module `@/lib/html` not found

**Step 3: Write the implementation**

```typescript
// src/lib/html.ts

/**
 * Escape user-provided strings for safe HTML embedding in email templates.
 * Replaces &, <, >, " with HTML entities.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/html.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/html.ts src/__tests__/unit/html.test.ts
git commit -m "refactor: extract escapeHtml into src/lib/html.ts"
```

---

### Task 2: Create `src/lib/validation.ts`

**Files:**
- Create: `src/lib/validation.ts`
- Test: `src/__tests__/unit/validation.test.ts`

**Step 1: Write the test**

```typescript
// src/__tests__/unit/validation.test.ts
import { describe, it, expect } from "vitest";
import { isValidEmail, isValidDuration, VALID_DURATIONS } from "@/lib/validation";

describe("isValidEmail", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("a@b.c")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("@no-local.com")).toBe(false);
    expect(isValidEmail("spaces in@email.com")).toBe(false);
  });
});

describe("isValidDuration", () => {
  it("accepts valid durations", () => {
    for (const d of VALID_DURATIONS) {
      expect(isValidDuration(d)).toBe(true);
    }
  });

  it("rejects invalid durations", () => {
    expect(isValidDuration(10)).toBe(false);
    expect(isValidDuration(120)).toBe(false);
    expect(isValidDuration(0)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/validation.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/lib/validation.ts

/** Valid appointment durations in minutes. */
export const VALID_DURATIONS = [15, 30, 45, 60, 90] as const;
export type DurationMinutes = (typeof VALID_DURATIONS)[number];

/** Check if a number is a valid appointment duration. */
export function isValidDuration(minutes: number): minutes is DurationMinutes {
  return (VALID_DURATIONS as readonly number[]).includes(minutes);
}

/** Validate an email address with the project-standard regex. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/validation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/validation.ts src/__tests__/unit/validation.test.ts
git commit -m "refactor: extract validation utilities into src/lib/validation.ts"
```

---

### Task 3: Add `getIsoWeekNumber` to `src/lib/time.ts`

**Files:**
- Modify: `src/lib/time.ts` (add function at end)
- Test: `src/__tests__/unit/time.test.ts`

**Step 1: Write the test**

```typescript
// src/__tests__/unit/time.test.ts
import { describe, it, expect } from "vitest";
import { getIsoWeekNumber } from "@/lib/time";

describe("getIsoWeekNumber", () => {
  it("returns correct week for known dates", () => {
    expect(getIsoWeekNumber("2026-01-05")).toBe(2); // Monday of week 2
    expect(getIsoWeekNumber("2025-12-29")).toBe(1); // Monday of ISO week 1, 2026
  });

  it("returns week 1 for first Monday of 2026", () => {
    expect(getIsoWeekNumber("2025-12-29")).toBe(1);
  });

  it("handles mid-year correctly", () => {
    expect(getIsoWeekNumber("2026-03-02")).toBe(10); // Monday of KW10
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/time.test.ts`
Expected: FAIL — `getIsoWeekNumber` is not exported

**Step 3: Add the function to `src/lib/time.ts`**

Append to the end of `src/lib/time.ts`:

```typescript
/**
 * Get the ISO 8601 week number for a date string.
 * Works correctly for any date (not just Mondays).
 */
export function getIsoWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z");
  const temp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  temp.setUTCDate(temp.getUTCDate() + 4 - (temp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/time.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/time.ts src/__tests__/unit/time.test.ts
git commit -m "refactor: add getIsoWeekNumber to src/lib/time.ts"
```

---

### Task 4: Add type exports to `src/lib/db/schema.ts`

**Files:**
- Modify: `src/lib/db/schema.ts` (append types after line 142)

**Step 1: Add types at the end of schema.ts**

Append after the existing type exports (line 142):

```typescript
// --- Derived union types ---

export type AppointmentStatus = "REQUESTED" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
export type EmailOutboxStatus = "PENDING" | "SENT" | "FAILED";

/** Frontend-shaped settings parsed from the key/value settings table. */
export interface AppSettings {
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
  slotDuration: string;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "refactor: add AppointmentStatus, AppSettings types to schema"
```

---

## Phase 2: Database Singleton

### Task 5: Add Drizzle singleton to `src/lib/db/index.ts`

**Files:**
- Modify: `src/lib/db/index.ts`

**Step 1: Add `getOrmDb()` to `src/lib/db/index.ts`**

Add after the existing `getDb()` function:

```typescript
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

let ormDb: BetterSQLite3Database;

/**
 * Drizzle ORM singleton. Use for all typed queries.
 * For raw transactions (especially .immediate()), use getDb() directly.
 */
export function getOrmDb(): BetterSQLite3Database {
  if (!ormDb) {
    ormDb = drizzle(getDb());
  }
  return ormDb;
}
```

The full file becomes:

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "path";
import { validateEnv } from "@/lib/env";

const DB_PATH = process.env.DATABASE_PATH || "./physiobook.sqlite";

let db: Database.Database;
let ormDb: BetterSQLite3Database;
let envValidated = false;

export function getDb(): Database.Database {
  if (!envValidated) {
    validateEnv();
    envValidated = true;
  }
  if (!db) {
    db = new Database(path.resolve(DB_PATH));
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

/**
 * Drizzle ORM singleton. Use for all typed queries.
 * For raw transactions (especially .immediate()), use getDb() directly.
 */
export function getOrmDb(): BetterSQLite3Database {
  if (!ormDb) {
    ormDb = drizzle(getDb());
  }
  return ormDb;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/lib/db/index.ts
git commit -m "refactor: add Drizzle ORM singleton getOrmDb() to db/index.ts"
```

---

## Phase 3: Domain Modules

### Task 6: Create `src/lib/settings.ts`

**Files:**
- Create: `src/lib/settings.ts`

**Step 1: Write the implementation**

```typescript
// src/lib/settings.ts
import { getDb } from "@/lib/db";

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
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/lib/settings.ts
git commit -m "refactor: create typed settings access layer in src/lib/settings.ts"
```

---

### Task 7: Create `src/lib/patients.ts`

**Files:**
- Create: `src/lib/patients.ts`

**Step 1: Write the implementation**

Extract from `src/app/api/appointments/route.ts:178-200`:

```typescript
// src/lib/patients.ts
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";

/**
 * Upsert a patient record by name (case-insensitive).
 * Creates if not exists. Updates email/phone only if currently empty.
 */
export function syncPatient(
  name: string,
  email?: string | null,
  phone?: string | null,
  now: number = Date.now()
): void {
  const db = getDb();

  const existing = db
    .prepare("SELECT id, email, phone FROM patients WHERE name = ? COLLATE NOCASE")
    .get(name) as { id: string; email: string | null; phone: string | null } | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO patients (id, name, email, phone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), name, email ?? null, phone ?? null, now, now);
    return;
  }

  const newEmail = !existing.email && email ? email : existing.email;
  const newPhone = !existing.phone && phone ? phone : existing.phone;

  if (newEmail !== existing.email || newPhone !== existing.phone) {
    db.prepare("UPDATE patients SET email = ?, phone = ?, updated_at = ? WHERE id = ?")
      .run(newEmail, newPhone, now, existing.id);
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/patients.ts
git commit -m "refactor: extract syncPatient into src/lib/patients.ts"
```

---

## Phase 4: Update Lib Modules

### Task 8: Update `src/lib/reminders.ts` — remove local `escapeHtml`

**Files:**
- Modify: `src/lib/reminders.ts`

**Step 1: Replace local escapeHtml with import**

Change the file:
- Add `import { escapeHtml } from "@/lib/html";` at line 2
- Remove lines 4-10 (the local `escapeHtml` function)

The top of the file becomes:

```typescript
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { escapeHtml } from "@/lib/html";

/**
 * Queue reminder emails...
```

**Step 2: Run existing tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/lib/reminders.ts
git commit -m "refactor: use shared escapeHtml in reminders.ts"
```

---

### Task 9: Update `src/lib/auth.ts` — use Drizzle singleton

**Files:**
- Modify: `src/lib/auth.ts`

**Step 1: Replace inline `drizzle(getDb())` with `getOrmDb()`**

Changes:
- Replace `import { drizzle } from "drizzle-orm/better-sqlite3";` with nothing (remove line)
- Replace `import { getDb } from "./db";` with `import { getOrmDb } from "./db";`
- Replace both occurrences of `const db = drizzle(getDb());` (lines 60 and 83) with `const db = getOrmDb();`
- Keep `parseCookieValue` private helper as-is

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "refactor: use Drizzle singleton in auth.ts"
```

---

## Phase 5: Cron Module Extraction

### Task 10: Create `src/lib/cron/expire.ts`

**Files:**
- Create: `src/lib/cron/expire.ts`

**Step 1: Write the implementation**

Extract from `src/app/api/cron/route.ts:37-49`:

```typescript
// src/lib/cron/expire.ts
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";

/**
 * Expire REQUESTED appointments that exceeded the timeout.
 * Returns number of appointments expired.
 */
export function expireTimedOutRequests(): number {
  const db = getDb();
  const now = Date.now();
  const timeoutHours = parseInt(getSetting("requestTimeoutHours"), 10);
  const timeoutMs = timeoutHours * 60 * 60 * 1000;

  const result = db
    .prepare(
      `UPDATE appointments SET status = 'EXPIRED', updated_at = ?
       WHERE status = 'REQUESTED' AND created_at < ?`
    )
    .run(now, now - timeoutMs);

  return result.changes;
}
```

**Step 2: Commit**

```bash
git add src/lib/cron/expire.ts
git commit -m "refactor: extract expireTimedOutRequests into lib/cron/expire.ts"
```

---

### Task 11: Create `src/lib/cron/cleanup.ts`

**Files:**
- Create: `src/lib/cron/cleanup.ts`

**Step 1: Write the implementation**

Extract from `src/app/api/cron/route.ts:51-102`:

```typescript
// src/lib/cron/cleanup.ts
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export interface CleanupResult {
  cleanedExpired: number;
  cleanedPast: number;
  cleanedOutboxSent: number;
  cleanedOutboxFailed: number;
  cleanedLoginAttempts: number;
}

/**
 * Run all GDPR retention cleanup tasks.
 */
export function runRetentionCleanup(): CleanupResult {
  const db = getDb();
  const now = Date.now();

  const retentionExpiredMs =
    parseInt(getSetting("retentionDaysExpired"), 10) * 24 * 60 * 60 * 1000;
  const retentionPastMs =
    parseInt(getSetting("retentionDaysPast"), 10) * 24 * 60 * 60 * 1000;

  const cleanedExpired = db
    .prepare(
      `DELETE FROM appointments WHERE status IN ('CANCELLED', 'EXPIRED') AND created_at < ?`
    )
    .run(now - retentionExpiredMs).changes;

  const cleanedPast = db
    .prepare(
      `DELETE FROM appointments WHERE status = 'CONFIRMED' AND end_time < ?`
    )
    .run(now - retentionPastMs).changes;

  const cleanedOutboxSent = db
    .prepare(
      `DELETE FROM email_outbox WHERE status = 'SENT' AND created_at < ?`
    )
    .run(now - 30 * 24 * 60 * 60 * 1000).changes;

  const cleanedOutboxFailed = db
    .prepare(
      `DELETE FROM email_outbox WHERE status = 'FAILED' AND created_at < ?`
    )
    .run(now - 90 * 24 * 60 * 60 * 1000).changes;

  const cleanedLoginAttempts = db
    .prepare(`DELETE FROM login_attempts WHERE attempted_at < ?`)
    .run(now - 24 * 60 * 60 * 1000).changes;

  return { cleanedExpired, cleanedPast, cleanedOutboxSent, cleanedOutboxFailed, cleanedLoginAttempts };
}
```

**Step 2: Commit**

```bash
git add src/lib/cron/cleanup.ts
git commit -m "refactor: extract retention cleanup into lib/cron/cleanup.ts"
```

---

### Task 12: Create `src/lib/cron/auto-archive.ts`

**Files:**
- Create: `src/lib/cron/auto-archive.ts`

**Step 1: Write the implementation**

Extract from `src/app/api/cron/route.ts:105-184`:

```typescript
// src/lib/cron/auto-archive.ts
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { generateArchivePdf } from "@/lib/archive";
import { sendEmailWithAttachment } from "@/lib/email";

/**
 * Check if auto-archive should run and send it if due.
 * Returns number of emails sent.
 */
export async function runAutoArchive(): Promise<number> {
  const config = getSettings([
    "autoArchiveEnabled",
    "autoArchiveInterval",
    "autoArchiveType",
    "autoArchiveEmail",
    "autoArchiveLastSent",
    "cronJobEmail",
  ]);

  if (config.autoArchiveEnabled !== "true" || !config.autoArchiveEmail) return 0;

  const now = Date.now();
  const interval = config.autoArchiveInterval || "weekly";
  const lastSent = parseInt(config.autoArchiveLastSent || "0", 10);

  const berlinNow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
  }).format(new Date(now));
  const [, , dayOfMonth] = berlinNow.split("-").map(Number);
  const berlinDow = new Date(berlinNow + "T12:00:00Z").getUTCDay();

  let shouldSend = false;
  if (interval === "daily" && now - lastSent > 23 * 3600_000) {
    shouldSend = true;
  } else if (interval === "weekly" && berlinDow === 1 && now - lastSent > 6 * 24 * 3600_000) {
    shouldSend = true;
  } else if (interval === "monthly" && dayOfMonth === 1 && now - lastSent > 27 * 24 * 3600_000) {
    shouldSend = true;
  }

  if (!shouldSend) return 0;

  const archiveType = (config.autoArchiveType as "week" | "month" | "year") || "week";
  const berlinDate = new Date(berlinNow + "T12:00:00Z");
  const yesterday = new Date(berlinDate);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const archiveDate = yesterday.toISOString().split("T")[0];

  const archiveLabels: Record<string, string> = {
    week: "Wochenarchiv",
    month: "Monatsarchiv",
    year: "Jahresarchiv",
  };

  const { buffer, filename, title } = await generateArchivePdf(archiveType, archiveDate);

  const recipients = [config.autoArchiveEmail];
  if (config.cronJobEmail) recipients.push(config.cronJobEmail);

  let sentCount = 0;
  for (const recipient of recipients) {
    const result = await sendEmailWithAttachment(
      recipient,
      title,
      `<p>Im Anhang finden Sie das ${archiveLabels[archiveType]}.</p>`,
      { filename, content: buffer }
    );
    if (result.ok) sentCount++;
    else console.error(`Cron: auto-archive email error (${recipient}):`, result.error);
  }

  if (sentCount > 0) {
    const db = getDb();
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('autoArchiveLastSent', ?)
       ON CONFLICT(key) DO UPDATE SET value = ?`
    ).run(String(now), String(now));
  }

  return sentCount;
}
```

**Step 2: Commit**

```bash
git add src/lib/cron/auto-archive.ts
git commit -m "refactor: extract auto-archive into lib/cron/auto-archive.ts"
```

---

### Task 13: Rewrite `src/app/api/cron/route.ts` as orchestrator

**Files:**
- Modify: `src/app/api/cron/route.ts` (replace entire file)

**Step 1: Rewrite the file**

```typescript
// src/app/api/cron/route.ts
import { processEmailQueue } from "@/lib/email";
import { queueAppointmentReminders } from "@/lib/reminders";
import { expireTimedOutRequests } from "@/lib/cron/expire";
import { runRetentionCleanup } from "@/lib/cron/cleanup";
import { runAutoArchive } from "@/lib/cron/auto-archive";

const CRON_SECRET = process.env.CRON_SECRET || "dev-cron-secret";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, number> = {};

  try { results.remindersQueued = queueAppointmentReminders(); }
  catch (e) { console.error("Cron: reminders error:", e); results.remindersQueued = 0; }

  try { results.emailsSent = await processEmailQueue(); }
  catch (e) { console.error("Cron: email queue error:", e); results.emailsSent = 0; }

  try { results.expired = expireTimedOutRequests(); }
  catch (e) { console.error("Cron: expire error:", e); results.expired = 0; }

  try { Object.assign(results, runRetentionCleanup()); }
  catch (e) { console.error("Cron: cleanup error:", e); }

  try { results.autoArchiveSent = await runAutoArchive(); }
  catch (e) { console.error("Cron: auto-archive error:", e); results.autoArchiveSent = 0; }

  return Response.json({ ok: true, results });
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/api/cron/route.ts
git commit -m "refactor: reduce cron/route.ts to thin orchestrator"
```

---

## Phase 6: API Route Updates — Deduplicate

### Task 14: Update `src/app/api/requests/route.ts`

**Files:**
- Modify: `src/app/api/requests/route.ts`

**Step 1: Apply changes**

- Add imports: `import { escapeHtml } from "@/lib/html";` and `import { isValidEmail, isValidDuration } from "@/lib/validation";`
- Remove local `escapeHtml` function (lines 161-167)
- Replace line 52: `if (![15, 30, 45, 60, 90].includes(durationMinutes))` → `if (!isValidDuration(durationMinutes))`
- Replace line 67: `if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))` → `if (!isValidEmail(contactEmail))`
- **KEEP** the raw `getDb()` and `.immediate()` transaction — this is the one route that must stay raw

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/api/requests/route.ts
git commit -m "refactor: use shared validation and escapeHtml in requests/route.ts"
```

---

### Task 15: Update `src/app/api/requests/[id]/confirm/route.ts` and `reject/route.ts`

**Files:**
- Modify: `src/app/api/requests/[id]/confirm/route.ts`
- Modify: `src/app/api/requests/[id]/reject/route.ts`

**Step 1: Apply changes to both files**

For `confirm/route.ts`:
- Add `import { escapeHtml } from "@/lib/html";` after existing imports
- Remove the local `escapeHtml` function (lines 67-73)

For `reject/route.ts`:
- Add `import { escapeHtml } from "@/lib/html";` after existing imports
- Remove the local `escapeHtml` function (lines 73-79)

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/api/requests/
git commit -m "refactor: use shared escapeHtml in confirm and reject routes"
```

---

### Task 16: Update `src/app/api/appointments/route.ts`

**Files:**
- Modify: `src/app/api/appointments/route.ts`

**Step 1: Apply changes**

- Replace `import { drizzle } from "drizzle-orm/better-sqlite3";` → remove
- Replace `import { getDb } from "@/lib/db";` → `import { getDb, getOrmDb } from "@/lib/db";`
- Add: `import { isValidDuration } from "@/lib/validation";`
- Add: `import { syncPatient } from "@/lib/patients";`
- Replace line 24 `const db = drizzle(getDb());` → `const db = getOrmDb();`
- Replace line 75 `if (![15, 30, 45, 60, 90].includes(durationMinutes))` → `if (!isValidDuration(durationMinutes))`
- Remove the local `syncPatient` function (lines 177-200)
- Keep `getDb()` usage for transactions (lines 122-145) — raw transactions stay raw

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/api/appointments/route.ts
git commit -m "refactor: use shared validation, syncPatient, and Drizzle singleton in appointments/route.ts"
```

---

### Task 17: Update `src/app/api/appointments/[id]/route.ts`

**Files:**
- Modify: `src/app/api/appointments/[id]/route.ts`

**Step 1: Apply changes**

- Add: `import { isValidDuration } from "@/lib/validation";`
- Replace line 61: `if (body.durationMinutes && ![15, 30, 45, 60, 90].includes(body.durationMinutes))` → `if (body.durationMinutes && !isValidDuration(body.durationMinutes))`

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/api/appointments/[id]/route.ts
git commit -m "refactor: use shared isValidDuration in appointments/[id]/route.ts"
```

---

### Task 18: Update `src/app/api/appointments/import/route.ts` — use `syncPatient`

**Files:**
- Modify: `src/app/api/appointments/import/route.ts`

**Step 1: Apply changes**

- Add: `import { syncPatient } from "@/lib/patients";`
- Remove the prepared statements: `patientCheck`, `patientInsert`, `patientUpdate` (lines 171-179)
- Replace the inline patient sync block inside the transaction (lines 202-221) with:
  ```typescript
  syncPatient(apt.patientName, apt.contactEmail, apt.contactPhone, now);
  ```
  Note: `syncPatient` calls `getDb()` internally, which is the same singleton connection, so it works correctly inside the transaction.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/api/appointments/import/route.ts
git commit -m "refactor: use shared syncPatient in appointments/import/route.ts"
```

---

### Task 19: Update email regex in patient and settings routes

**Files:**
- Modify: `src/app/api/patients/route.ts`
- Modify: `src/app/api/patients/[id]/route.ts`
- Modify: `src/app/api/patients/import/route.ts`
- Modify: `src/app/api/settings/route.ts`

**Step 1: Apply changes to all files**

In each file:
- Add: `import { isValidEmail } from "@/lib/validation";`
- Replace every occurrence of `/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(...)` with `isValidEmail(...)`

Specific replacements:
- `patients/route.ts:50` — `!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)` → `!isValidEmail(body.email)`
- `patients/[id]/route.ts:29` — same pattern
- `patients/import/route.ts:80` — same pattern
- `settings/route.ts:78,91,109,115` — 4 occurrences of the regex → `!isValidEmail(value)`

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/api/patients/ src/app/api/settings/route.ts
git commit -m "refactor: use shared isValidEmail across patient and settings routes"
```

---

### Task 20: Update `src/app/api/blockers/route.ts` and `src/app/api/settings/route.ts` — use Drizzle singleton

**Files:**
- Modify: `src/app/api/blockers/route.ts`
- Modify: `src/app/api/settings/route.ts`

**Step 1: Apply changes**

In `blockers/route.ts`:
- Replace `import { drizzle } from "drizzle-orm/better-sqlite3";` → remove
- Replace `import { getDb } from "@/lib/db";` → `import { getDb, getOrmDb } from "@/lib/db";`
- Replace line 22 `const db = drizzle(getDb());` → `const db = getOrmDb();`
- Keep `getDb()` usage in the POST handler for transactions (lines 78, 83, 100)

In `settings/route.ts`:
- Replace `import { drizzle } from "drizzle-orm/better-sqlite3";` → remove
- Replace `import { getDb } from "@/lib/db";` → `import { getDb, getOrmDb } from "@/lib/db";`
- Replace line 9 `const db = drizzle(getDb());` → `const db = getOrmDb();`
- Keep `getDb()` in the PATCH handler for raw upserts (line 125)

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/api/blockers/route.ts src/app/api/settings/route.ts
git commit -m "refactor: use Drizzle singleton in blockers and settings routes"
```

---

### Task 21: Update `src/lib/archive.ts` — use `getIsoWeekNumber`

**Files:**
- Modify: `src/lib/archive.ts`

**Step 1: Apply changes**

- Add `getIsoWeekNumber` to the existing time import: `import { getWeekMonday, addDays, berlinDayStartMs, formatBerlinTime, formatBerlinDate, formatBerlinDateTime, epochToDateInput, getIsoWeekNumber } from "@/lib/time";`
- Replace lines 49-53 (the inline ISO week calculation) with: `const weekNum = getIsoWeekNumber(monday);`

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/archive.ts
git commit -m "refactor: use shared getIsoWeekNumber in archive.ts"
```

---

## Phase 7: Type Migration

### Task 22: Replace `src/types/models.ts` with re-exports and update all consumers

**Files:**
- Modify: `src/types/models.ts` (replace body with re-exports)
- Modify: `src/components/DashboardClient.tsx` (line 11)
- Modify: `src/components/forms/AppointmentForm.tsx` (line 5)
- Modify: `src/components/calendar/DayView.tsx` (line 5)
- Modify: `src/components/calendar/WeekView.tsx` (line 5)
- Modify: `src/components/calendar/MonthView.tsx` (line 5)

**Step 1: Update all component imports to use schema directly**

In each component file, replace:
```typescript
import type { Appointment, Blocker } from "@/types/models";
// or
import type { Appointment, Blocker, Settings } from "@/types/models";
// or
import type { Appointment } from "@/types/models";
```

With:
```typescript
import type { Appointment, Blocker } from "@/lib/db/schema";
// or
import type { Appointment, Blocker, AppSettings } from "@/lib/db/schema";
// or
import type { Appointment } from "@/lib/db/schema";
```

For `DayView.tsx` and `WeekView.tsx` which use `Settings`:
```typescript
import type { Appointment, Blocker, AppSettings } from "@/lib/db/schema";
```
Then rename usage: wherever the component has `Settings` as a local type name, use `AppSettings` or alias at import: `import type { AppSettings as Settings }`.

For `PatientenClient.tsx`: keep its local `Patient` interface for now (the API returns a subset of fields).

**Step 2: Delete `src/types/models.ts`**

Remove the file entirely.

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/types/ src/components/
git commit -m "refactor: unify types — use schema-derived types, delete models.ts"
```

---

## Phase 8: Shared UI Primitives

### Task 23: Create `src/components/ui/Modal.tsx`

**Files:**
- Create: `src/components/ui/Modal.tsx`

**Step 1: Write the component**

```tsx
// src/components/ui/Modal.tsx
"use client";

interface ModalProps {
  title: string;
  titleClassName?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: "sm" | "md";
}

export default function Modal({
  title,
  titleClassName = "text-gray-900",
  onClose,
  children,
  maxWidth = "sm",
}: ModalProps) {
  const widthClass = maxWidth === "md" ? "max-w-md" : "max-w-sm";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-lg shadow-xl w-full ${widthClass}`}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className={`text-lg font-semibold ${titleClassName}`}>{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="p-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ui/Modal.tsx
git commit -m "refactor: create shared Modal component"
```

---

### Task 24: Create `src/components/ui/Toggle.tsx`

**Files:**
- Create: `src/components/ui/Toggle.tsx`

**Step 1: Write the component**

```tsx
// src/components/ui/Toggle.tsx
"use client";

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  labelOn?: string;
  labelOff?: string;
}

export default function Toggle({
  enabled,
  onChange,
  labelOn = "Aktiviert",
  labelOff = "Deaktiviert",
}: ToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          enabled ? "bg-blue-500" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            enabled ? "translate-x-5" : ""
          }`}
        />
      </button>
      <span className="text-sm text-gray-700">
        {enabled ? labelOn : labelOff}
      </span>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ui/Toggle.tsx
git commit -m "refactor: create shared Toggle component"
```

---

### Task 25: Create `src/components/ui/StatusMessage.tsx`

**Files:**
- Create: `src/components/ui/StatusMessage.tsx`

**Step 1: Write the component**

```tsx
// src/components/ui/StatusMessage.tsx
"use client";

interface StatusMessageProps {
  message: { type: "success" | "error"; text: string } | null;
  inline?: boolean;
}

export default function StatusMessage({ message, inline = false }: StatusMessageProps) {
  if (!message) return null;
  const colorClass = message.type === "success" ? "text-green-600" : "text-red-600";
  if (inline) {
    return <span className={`text-sm ${colorClass}`}>{message.text}</span>;
  }
  return <p className={`text-sm ${colorClass}`}>{message.text}</p>;
}
```

**Step 2: Commit**

```bash
git add src/components/ui/StatusMessage.tsx
git commit -m "refactor: create shared StatusMessage component"
```

---

## Phase 9: Component Decomposition

### Task 26: Extract DashboardClient inline modals

**Files:**
- Create: `src/components/dashboard/BlockerDeleteModal.tsx`
- Create: `src/components/dashboard/BulkDeleteModal.tsx`
- Modify: `src/components/DashboardClient.tsx`

**Step 1: Create BlockerDeleteModal**

```tsx
// src/components/dashboard/BlockerDeleteModal.tsx
"use client";

import Modal from "@/components/ui/Modal";
import type { Blocker } from "@/lib/db/schema";

interface Props {
  blocker: Blocker;
  deleteScope: "single" | "group";
  deleting: boolean;
  onScopeChange: (scope: "single" | "group") => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function BlockerDeleteModal({
  blocker, deleteScope, deleting, onScopeChange, onConfirm, onClose,
}: Props) {
  return (
    <Modal title="Blocker löschen" onClose={onClose}>
      <p className="text-sm text-gray-700">
        Blocker <strong>&quot;{blocker.title}&quot;</strong> wirklich löschen?
      </p>

      {blocker.blockerGroupId && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="blockerDeleteScope"
              checked={deleteScope === "single"}
              onChange={() => onScopeChange("single")}
            />
            <span className="text-gray-700">Nur diesen Blocker</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="blockerDeleteScope"
              checked={deleteScope === "group"}
              onChange={() => onScopeChange("group")}
            />
            <span className="text-gray-700">Alle Blocker dieser Gruppe</span>
          </label>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onConfirm}
          disabled={deleting}
          className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? "Löschen..." : "Löschen"}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 border text-sm rounded-md hover:bg-gray-50"
        >
          Abbrechen
        </button>
      </div>
    </Modal>
  );
}
```

**Step 2: Create BulkDeleteModal**

```tsx
// src/components/dashboard/BulkDeleteModal.tsx
"use client";

import Modal from "@/components/ui/Modal";

interface Props {
  title: string;
  description: string;
  deleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function BulkDeleteModal({
  title, description, deleting, onConfirm, onClose,
}: Props) {
  return (
    <Modal title={title} titleClassName="text-red-600" onClose={onClose}>
      <p className="text-sm text-gray-700">
        <strong>{description}</strong> wirklich löschen?
      </p>
      <p className="text-xs text-red-500">Diese Aktion kann nicht rückgängig gemacht werden.</p>
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onConfirm}
          disabled={deleting}
          className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50"
        >
          {deleting ? "Löschen..." : title}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 border text-sm rounded-md hover:bg-gray-50"
        >
          Abbrechen
        </button>
      </div>
    </Modal>
  );
}
```

**Step 3: Update DashboardClient**

- Add imports: `import BlockerDeleteModal from "./dashboard/BlockerDeleteModal";` and `import BulkDeleteModal from "./dashboard/BulkDeleteModal";`
- Remove local `todayBerlin` function (lines 16-21), add `todayBerlin` to the time import
- Replace inline blocker delete modal (lines 312-370) with:
  ```tsx
  {deletingBlocker && (
    <BlockerDeleteModal
      blocker={deletingBlocker}
      deleteScope={deleteScope}
      deleting={deleting}
      onScopeChange={setDeleteScope}
      onConfirm={handleDeleteBlocker}
      onClose={() => setDeletingBlocker(null)}
    />
  )}
  ```
- Replace inline bulk delete modal (lines 372-410) with:
  ```tsx
  {showBulkDelete && (() => {
    const { title, description } = getBulkDeleteLabel();
    return (
      <BulkDeleteModal
        title={title}
        description={description}
        deleting={bulkDeleting}
        onConfirm={handleBulkDelete}
        onClose={() => setShowBulkDelete(false)}
      />
    );
  })()}
  ```

**Step 4: Run tests and verify**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/components/dashboard/ src/components/DashboardClient.tsx
git commit -m "refactor: extract DashboardClient modals into separate components"
```

---

### Task 27: Decompose `VerwaltungClient` into panels

**Files:**
- Create: `src/components/verwaltung/PdfImportPanel.tsx`
- Create: `src/components/verwaltung/ArchiveDownloadPanel.tsx`
- Create: `src/components/verwaltung/SmtpSettingsPanel.tsx`
- Create: `src/components/verwaltung/ReminderSettingsPanel.tsx`
- Create: `src/components/verwaltung/AutoArchivePanel.tsx`
- Modify: `src/components/VerwaltungClient.tsx`

This is the largest single task. Each panel component receives its state and callbacks as props from the parent. The parent `VerwaltungClient` retains all state and passes it down.

**Step 1: Create each panel component**

Each panel extracts a section of JSX from `VerwaltungClient.tsx`. The panels are purely presentational — they receive state as props and call callbacks for mutations. The complete code for each panel should match the existing JSX exactly, with props replacing direct state access.

The parent `VerwaltungClient.tsx` shrinks to state management + composition:

```tsx
// src/components/VerwaltungClient.tsx (simplified orchestrator)
"use client";

import { useState, useEffect, useRef } from "react";
import { todayBerlin } from "@/lib/time";
import PdfImportPanel from "./verwaltung/PdfImportPanel";
import ArchiveDownloadPanel from "./verwaltung/ArchiveDownloadPanel";
import SmtpSettingsPanel from "./verwaltung/SmtpSettingsPanel";
import ReminderSettingsPanel from "./verwaltung/ReminderSettingsPanel";
import AutoArchivePanel from "./verwaltung/AutoArchivePanel";

export default function VerwaltungClient() {
  const [date, setDate] = useState(todayBerlin);
  // ... all existing state declarations stay here ...

  // ... all fetch and handler functions stay here ...

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Datum auswählen</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <PdfImportPanel ... />
      <ArchiveDownloadPanel ... />
      <SmtpSettingsPanel ... />
      <ReminderSettingsPanel ... />
      <AutoArchivePanel ... />
    </div>
  );
}
```

**Implementation note:** The exact props for each panel should be extracted by moving the JSX section and seeing what state/handlers it references. Each panel needs only its relevant slice of state + callbacks.

**Step 2: Also update VerwaltungClient imports**

- Remove local `todayBerlin` function (lines 6-11), import from `@/lib/time`
- Import `getIsoWeekNumber` from `@/lib/time` and use it in `getWeekInfo`

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/components/verwaltung/ src/components/VerwaltungClient.tsx
git commit -m "refactor: decompose VerwaltungClient into 5 panel sub-components"
```

---

### Task 28: Update `WeekView.tsx` — deduplicate `STATUS_COLORS`, ISO week, and `todayBerlin`

**Files:**
- Modify: `src/components/calendar/WeekView.tsx`

**Step 1: Apply changes**

- Add `getIsoWeekNumber` to the `@/lib/time` import
- Remove local `STATUS_COLORS` (lines 126-131) and `LUNCH_STATUS_COLORS` (lines 133-138) — keep them but rename inline or define as module-level constants outside the component since the values differ from AppointmentCard (200 vs 100 saturation). They are NOT truly duplicated — leave them in this file but move above the component.
- Replace the inline ISO week number IIFE in the JSX (around line 185) with `getIsoWeekNumber(monday)`
- Replace the `todayStr` inline (line 143) with `todayBerlin()` imported from `@/lib/time`

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/calendar/WeekView.tsx
git commit -m "refactor: use shared time utilities in WeekView"
```

---

## Phase 10: Final Verification

### Task 29: Run full test suite and TypeScript check

**Files:** None (verification only)

**Step 1: TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: Zero errors

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new)

**Step 3: Build check**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Final commit**

```bash
git add -A
git commit -m "refactor: complete codebase refactoring — DRY, unified types, decomposed components"
```

---

## Summary of Changes

### New files created (15):
| File | Purpose |
|------|---------|
| `src/lib/html.ts` | Shared `escapeHtml` (was duplicated 4x) |
| `src/lib/validation.ts` | `isValidEmail`, `isValidDuration`, `VALID_DURATIONS` |
| `src/lib/settings.ts` | Typed `getSetting`/`getSettings` |
| `src/lib/patients.ts` | `syncPatient` (was duplicated 2x) |
| `src/lib/cron/expire.ts` | Request expiration logic |
| `src/lib/cron/cleanup.ts` | GDPR retention cleanup |
| `src/lib/cron/auto-archive.ts` | Auto-archive email logic |
| `src/components/ui/Modal.tsx` | Shared modal (was hand-coded 4x) |
| `src/components/ui/Toggle.tsx` | Shared toggle switch (was coded 3x) |
| `src/components/ui/StatusMessage.tsx` | Shared success/error message |
| `src/components/dashboard/BlockerDeleteModal.tsx` | Extracted from DashboardClient |
| `src/components/dashboard/BulkDeleteModal.tsx` | Extracted from DashboardClient |
| `src/components/verwaltung/PdfImportPanel.tsx` | Extracted from VerwaltungClient |
| `src/components/verwaltung/ArchiveDownloadPanel.tsx` | Extracted from VerwaltungClient |
| `src/components/verwaltung/SmtpSettingsPanel.tsx` | Extracted from VerwaltungClient |

Plus `ReminderSettingsPanel.tsx` and `AutoArchivePanel.tsx` in verwaltung/.

### Files deleted (1):
- `src/types/models.ts`

### Files modified (~20):
All API routes, lib modules, and component files as detailed in each task.

### Key constraints:
- `requests/route.ts` keeps raw `getDb().transaction().immediate()` — Drizzle doesn't support `BEGIN IMMEDIATE`
- Transaction code in other routes keeps `getDb()` for raw transactions
- `PatientenClient.tsx` keeps its local `Patient` interface (API returns subset of columns)
