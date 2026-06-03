# Appointment Series Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current implicit `series_id` grouping with a clear appointment-series model, better mutation semantics, and a more understandable UI for creating and editing recurring appointments.

**Architecture:** Add an `appointment_series` table that stores the recurrence rule and keep concrete appointments materialized in `appointments` for calendar display, reminders, conflict checks, archive, and manual exceptions. Move recurrence behavior into focused library modules so API routes become thin orchestration layers. Update the appointment form to present recurrence creation, series summaries, conflict review, and edit scopes as explicit UI concepts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, SQLite with better-sqlite3 and Drizzle schema definitions, Vitest unit tests.

---

## Scope

This plan covers appointment series only. Blocker groups already have a simpler `blocker_group_id` model and should not be redesigned in this pass except where conflict checks need shared helpers.

## File Structure

- Create: `drizzle/0008_appointment_series_model.sql`
  - Adds `appointment_series`.
  - Adds occurrence metadata to `appointments`.
  - Migrates existing `appointments.series_id` groups into `appointment_series`.
  - Adds indexes for series lookups and future-scope updates.
- Modify: `src/lib/db/schema.ts`
  - Adds `appointmentSeries` Drizzle table.
  - Adds new appointment columns and exported TypeScript types.
- Create: `src/lib/series-rules.ts`
  - Pure recurrence helpers: generate occurrences, infer interval, normalize scope, summarize a series.
- Create: `src/__tests__/unit/series-rules.test.ts`
  - Unit tests for pure recurrence behavior.
- Create: `src/lib/appointment-series.ts`
  - DB-backed service for creating, updating, splitting, deleting, and summarizing appointment series.
- Create: `src/__tests__/unit/appointment-series.test.ts`
  - Unit tests with an in-memory SQLite database and injected service dependencies.
- Modify: `src/lib/overlap.ts`
  - Adds conflict helper that excludes a concrete set of appointment IDs.
- Modify: `src/app/api/appointments/route.ts`
  - Delegates series creation to `appointment-series.ts`.
  - Returns series metadata in appointment payloads.
- Modify: `src/app/api/appointments/[id]/route.ts`
  - Supports `scope=single|future|series`.
  - Delegates recurrence mutations to `appointment-series.ts`.
- Modify: `src/app/api/appointments/by-patient/route.ts`
  - Returns occurrence metadata for patient appointment lists.
- Modify: `src/app/api/appointments/import/route.ts`
  - Keeps imported appointments ungrouped but initializes new nullable fields through schema defaults.
- Modify: `src/app/api/requests/route.ts`
  - Keeps public requests as non-series appointments.
- Modify: `src/components/forms/AppointmentForm.tsx`
  - Replaces the small recurrence checkbox area with clearer series creation and edit controls.
- Create: `src/components/forms/SeriesFields.tsx`
  - Owns recurrence creation controls and preview.
- Create: `src/components/forms/SeriesScopeDialog.tsx`
  - Asks whether an edit/delete applies to one occurrence, future occurrences, or the whole series.
- Create: `src/components/forms/SeriesSummary.tsx`
  - Shows concise series rule information inside the edit form.
- Modify: `src/lib/db/schema.ts`
  - Extends `AppointmentWithContact` with optional series summary fields.
- Modify: `docs/codebase-overview.md`
  - Documents the new model and API scopes.

---

### Task 1: Add Series Schema And Migration

**Files:**
- Create: `drizzle/0008_appointment_series_model.sql`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Write the migration**

Create `drizzle/0008_appointment_series_model.sql` with this content:

```sql
CREATE TABLE `appointment_series` (
  `id` text PRIMARY KEY NOT NULL,
  `patient_id` text,
  `patient_name` text NOT NULL,
  `first_start_time` integer NOT NULL,
  `duration_minutes` integer NOT NULL CHECK(`duration_minutes` IN (15, 30, 45, 60, 90)),
  `interval_weeks` integer NOT NULL CHECK(`interval_weeks` IN (1, 2, 3, 4)),
  `occurrence_count` integer NOT NULL CHECK(`occurrence_count` >= 1 AND `occurrence_count` <= 520),
  `last_start_time` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'ACTIVE' CHECK(`status` IN ('ACTIVE', 'CANCELLED')),
  `notes` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `appointments` ADD COLUMN `series_occurrence_index` integer;
--> statement-breakpoint
ALTER TABLE `appointments` ADD COLUMN `series_original_start_time` integer;
--> statement-breakpoint
ALTER TABLE `appointments` ADD COLUMN `series_exception_type` text CHECK(`series_exception_type` IS NULL OR `series_exception_type` IN ('moved', 'cancelled', 'detached'));
--> statement-breakpoint
INSERT INTO `appointment_series` (
  `id`,
  `patient_id`,
  `patient_name`,
  `first_start_time`,
  `duration_minutes`,
  `interval_weeks`,
  `occurrence_count`,
  `last_start_time`,
  `status`,
  `notes`,
  `created_at`,
  `updated_at`
)
SELECT
  a.`series_id`,
  (
    SELECT b.`patient_id`
    FROM `appointments` b
    WHERE b.`series_id` = a.`series_id`
    ORDER BY b.`start_time` ASC, b.`id` ASC
    LIMIT 1
  ),
  (
    SELECT b.`patient_name`
    FROM `appointments` b
    WHERE b.`series_id` = a.`series_id`
    ORDER BY b.`start_time` ASC, b.`id` ASC
    LIMIT 1
  ),
  MIN(a.`start_time`),
  (
    SELECT b.`duration_minutes`
    FROM `appointments` b
    WHERE b.`series_id` = a.`series_id`
    ORDER BY b.`start_time` ASC, b.`id` ASC
    LIMIT 1
  ),
  CASE
    WHEN COUNT(*) < 2 THEN 1
    WHEN CAST(ROUND((
      (
        SELECT b.`start_time`
        FROM `appointments` b
        WHERE b.`series_id` = a.`series_id`
        ORDER BY b.`start_time` ASC, b.`id` ASC
        LIMIT 1 OFFSET 1
      ) - MIN(a.`start_time`)
    ) / 604800000.0) AS integer) IN (1, 2, 3, 4)
    THEN CAST(ROUND((
      (
        SELECT b.`start_time`
        FROM `appointments` b
        WHERE b.`series_id` = a.`series_id`
        ORDER BY b.`start_time` ASC, b.`id` ASC
        LIMIT 1 OFFSET 1
      ) - MIN(a.`start_time`)
    ) / 604800000.0) AS integer)
    ELSE 1
  END,
  COUNT(*),
  MAX(a.`start_time`),
  'ACTIVE',
  (
    SELECT b.`notes`
    FROM `appointments` b
    WHERE b.`series_id` = a.`series_id`
    ORDER BY b.`start_time` ASC, b.`id` ASC
    LIMIT 1
  ),
  MIN(a.`created_at`),
  MAX(a.`updated_at`)
FROM `appointments` a
WHERE a.`series_id` IS NOT NULL
GROUP BY a.`series_id`;
--> statement-breakpoint
UPDATE `appointments`
SET
  `series_occurrence_index` = (
    SELECT COUNT(*)
    FROM `appointments` b
    WHERE b.`series_id` = `appointments`.`series_id`
      AND (
        b.`start_time` < `appointments`.`start_time`
        OR (b.`start_time` = `appointments`.`start_time` AND b.`id` <= `appointments`.`id`)
      )
  ) - 1,
  `series_original_start_time` = `start_time`,
  `series_exception_type` = NULL
WHERE `series_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_appointment_series_patient` ON `appointment_series` (`patient_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_appointment_series_time` ON `appointment_series` (`first_start_time`, `last_start_time`);
--> statement-breakpoint
CREATE INDEX `idx_appointments_series_index` ON `appointments` (`series_id`, `series_occurrence_index`);
--> statement-breakpoint
CREATE INDEX `idx_appointments_series_original_start` ON `appointments` (`series_id`, `series_original_start_time`);
```

- [ ] **Step 2: Update Drizzle schema**

In `src/lib/db/schema.ts`, add `appointmentSeries` after the `appointments` table:

```ts
export const appointmentSeries = sqliteTable(
  "appointment_series",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id"),
    patientName: text("patient_name").notNull(),
    firstStartTime: integer("first_start_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    intervalWeeks: integer("interval_weeks").notNull(),
    occurrenceCount: integer("occurrence_count").notNull(),
    lastStartTime: integer("last_start_time").notNull(),
    status: text("status", { enum: ["ACTIVE", "CANCELLED"] }).notNull().default("ACTIVE"),
    notes: text("notes"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_appointment_series_patient").on(table.patientId, table.status),
    index("idx_appointment_series_time").on(table.firstStartTime, table.lastStartTime),
  ]
);
```

In the `appointments` table definition, add these fields after `seriesId`:

```ts
    seriesOccurrenceIndex: integer("series_occurrence_index"),
    seriesOriginalStartTime: integer("series_original_start_time"),
    seriesExceptionType: text("series_exception_type", {
      enum: ["moved", "cancelled", "detached"],
    }),
```

In the appointment indexes list, add:

```ts
    index("idx_appointments_series_index").on(table.seriesId, table.seriesOccurrenceIndex),
    index("idx_appointments_series_original_start").on(table.seriesId, table.seriesOriginalStartTime),
```

Add exported types near the existing type exports:

```ts
export type AppointmentSeries = typeof appointmentSeries.$inferSelect;
export type NewAppointmentSeries = typeof appointmentSeries.$inferInsert;
export type AppointmentSeriesStatus = "ACTIVE" | "CANCELLED";
export type AppointmentSeriesExceptionType = "moved" | "cancelled" | "detached";
export type AppointmentSeriesScope = "single" | "future" | "series";

export interface AppointmentSeriesSummary {
  id: string;
  intervalWeeks: number;
  occurrenceCount: number;
  firstStartTime: number;
  lastStartTime: number;
  occurrenceIndex: number | null;
  exceptionType: AppointmentSeriesExceptionType | null;
}
```

Extend `AppointmentWithContact`:

```ts
export interface AppointmentWithContact extends Appointment {
  contactEmail: string | null;
  contactPhone: string | null;
  seriesSummary?: AppointmentSeriesSummary | null;
}
```

- [ ] **Step 3: Run migration on a temporary database**

Run:

```powershell
$env:DATABASE_PATH="$PWD\physiobook-series-plan-check.sqlite"; npm run db:migrate
```

Expected: migration completes without SQLite syntax errors.

- [ ] **Step 4: Run typecheck**

Run:

```powershell
npx tsc --noEmit
```

Expected: TypeScript reports errors in files that still assume the old schema. Keep those errors for later tasks unless they come from syntax mistakes in `schema.ts`.

- [ ] **Step 5: Commit**

```powershell
git add drizzle/0008_appointment_series_model.sql src/lib/db/schema.ts
git commit -m "feat: add appointment series schema"
```

---

### Task 2: Add Pure Series Rule Helpers

**Files:**
- Create: `src/lib/series-rules.ts`
- Create: `src/__tests__/unit/series-rules.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/unit/series-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  generateSeriesOccurrences,
  inferSeriesIntervalWeeks,
  normalizeSeriesScope,
  summarizeInterval,
} from "@/lib/series-rules";

describe("generateSeriesOccurrences", () => {
  it("generates weekly occurrences from the selected start time", () => {
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    expect(generateSeriesOccurrences({ startTime: start, durationMinutes: 30, count: 3, intervalWeeks: 1 })).toEqual([
      { index: 0, start: start, end: start + 30 * 60_000, originalStart: start },
      { index: 1, start: start + 7 * 86_400_000, end: start + 7 * 86_400_000 + 30 * 60_000, originalStart: start + 7 * 86_400_000 },
      { index: 2, start: start + 14 * 86_400_000, end: start + 14 * 86_400_000 + 30 * 60_000, originalStart: start + 14 * 86_400_000 },
    ]);
  });

  it("rejects unsupported interval values", () => {
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    expect(() => generateSeriesOccurrences({ startTime: start, durationMinutes: 30, count: 3, intervalWeeks: 5 })).toThrow("intervalWeeks must be 1, 2, 3, or 4");
  });

  it("rejects counts outside the supported appointment series range", () => {
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    expect(() => generateSeriesOccurrences({ startTime: start, durationMinutes: 30, count: 0, intervalWeeks: 1 })).toThrow("count must be between 1 and 52");
    expect(() => generateSeriesOccurrences({ startTime: start, durationMinutes: 30, count: 53, intervalWeeks: 1 })).toThrow("count must be between 1 and 52");
  });
});

describe("inferSeriesIntervalWeeks", () => {
  it("infers two-week intervals from sorted occurrence starts", () => {
    const start = Date.parse("2026-06-03T07:00:00.000Z");
    expect(inferSeriesIntervalWeeks([start, start + 14 * 86_400_000, start + 28 * 86_400_000])).toBe(2);
  });

  it("falls back to weekly when there is not enough information", () => {
    expect(inferSeriesIntervalWeeks([Date.parse("2026-06-03T07:00:00.000Z")])).toBe(1);
  });
});

describe("normalizeSeriesScope", () => {
  it("accepts the three supported scopes", () => {
    expect(normalizeSeriesScope("single")).toBe("single");
    expect(normalizeSeriesScope("future")).toBe("future");
    expect(normalizeSeriesScope("series")).toBe("series");
  });

  it("defaults missing scope to single", () => {
    expect(normalizeSeriesScope(null)).toBe("single");
  });

  it("rejects unknown scopes", () => {
    expect(() => normalizeSeriesScope("all")).toThrow("scope muss 'single', 'future' oder 'series' sein");
  });
});

describe("summarizeInterval", () => {
  it("returns concise German labels", () => {
    expect(summarizeInterval(1)).toBe("wöchentlich");
    expect(summarizeInterval(2)).toBe("alle 2 Wochen");
    expect(summarizeInterval(4)).toBe("alle 4 Wochen");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npx vitest run src/__tests__/unit/series-rules.test.ts
```

Expected: FAIL because `src/lib/series-rules.ts` does not exist.

- [ ] **Step 3: Implement pure helpers**

Create `src/lib/series-rules.ts`:

```ts
import type { AppointmentSeriesScope } from "@/lib/db/schema";

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const SUPPORTED_INTERVALS = [1, 2, 3, 4] as const;

export interface GenerateSeriesOccurrencesInput {
  startTime: number;
  durationMinutes: number;
  count: number;
  intervalWeeks: number;
}

export interface GeneratedSeriesOccurrence {
  index: number;
  start: number;
  end: number;
  originalStart: number;
}

export function generateSeriesOccurrences(input: GenerateSeriesOccurrencesInput): GeneratedSeriesOccurrence[] {
  if (!SUPPORTED_INTERVALS.includes(input.intervalWeeks as 1 | 2 | 3 | 4)) {
    throw new Error("intervalWeeks must be 1, 2, 3, or 4");
  }
  if (input.count < 1 || input.count > 52) {
    throw new Error("count must be between 1 and 52");
  }

  const durationMs = input.durationMinutes * 60_000;
  return Array.from({ length: input.count }, (_, index) => {
    const start = input.startTime + index * input.intervalWeeks * MS_PER_WEEK;
    return { index, start, end: start + durationMs, originalStart: start };
  });
}

export function inferSeriesIntervalWeeks(sortedStarts: number[]): number {
  if (sortedStarts.length < 2) return 1;
  const weeks = Math.round((sortedStarts[1] - sortedStarts[0]) / MS_PER_WEEK);
  return SUPPORTED_INTERVALS.includes(weeks as 1 | 2 | 3 | 4) ? weeks : 1;
}

export function normalizeSeriesScope(scope: string | null): AppointmentSeriesScope {
  if (!scope) return "single";
  if (scope === "single" || scope === "future" || scope === "series") return scope;
  throw new Error("scope muss 'single', 'future' oder 'series' sein");
}

export function summarizeInterval(intervalWeeks: number): string {
  return intervalWeeks === 1 ? "wöchentlich" : `alle ${intervalWeeks} Wochen`;
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npx vitest run src/__tests__/unit/series-rules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/series-rules.ts src/__tests__/unit/series-rules.test.ts
git commit -m "feat: add appointment series rule helpers"
```

---

### Task 3: Add Testable Appointment Series Service Creation

**Files:**
- Create: `src/lib/appointment-series.ts`
- Create: `src/__tests__/unit/appointment-series.test.ts`

- [ ] **Step 1: Write failing service creation tests**

Create `src/__tests__/unit/appointment-series.test.ts`:

```ts
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
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npx vitest run src/__tests__/unit/appointment-series.test.ts
```

Expected: FAIL because `src/lib/appointment-series.ts` does not exist.

- [ ] **Step 3: Implement creation service**

Create `src/lib/appointment-series.ts`:

```ts
import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { syncPatient, updatePatientContact } from "@/lib/patients";
import { hasOverlap } from "@/lib/overlap";
import { generateSeriesOccurrences } from "@/lib/series-rules";

export interface AppointmentSeriesServiceDeps {
  db: Database.Database;
  now: () => number;
  uuid: () => string;
  syncPatient: typeof syncPatient;
  updatePatientContact: typeof updatePatientContact;
}

export interface CreateAppointmentSeriesInput {
  patientName: string;
  patientId?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  startTime: number;
  durationMinutes: number;
  status: string;
  notes?: string | null;
  flaggedNotes?: boolean;
  intervalWeeks: number;
  count: number;
  force?: boolean;
}

export function defaultAppointmentSeriesDeps(): AppointmentSeriesServiceDeps {
  return {
    db: getDb(),
    now: () => Date.now(),
    uuid: () => uuidv4(),
    syncPatient,
    updatePatientContact,
  };
}

export function createAppointmentSeries(
  input: CreateAppointmentSeriesInput,
  deps: AppointmentSeriesServiceDeps = defaultAppointmentSeriesDeps()
): { seriesId: string; created: string[] } {
  const occurrences = generateSeriesOccurrences({
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    count: input.count,
    intervalWeeks: input.intervalWeeks,
  });

  if (!input.force) {
    const rangeStart = occurrences[0].start;
    const rangeEnd = occurrences[occurrences.length - 1].end;
    const existingAppointments = deps.db.prepare(`
      SELECT id, patient_name as name, start_time as startTime, end_time as endTime
      FROM appointments
      WHERE status IN ('CONFIRMED', 'REQUESTED')
        AND start_time < ?
        AND end_time > ?
    `).all(rangeEnd, rangeStart) as { id: string; name: string; startTime: number; endTime: number }[];
    const existingBlockers = deps.db.prepare(`
      SELECT id, title as name, start_time as startTime, end_time as endTime
      FROM blockers
      WHERE start_time < ?
        AND end_time > ?
    `).all(rangeEnd, rangeStart) as { id: string; name: string; startTime: number; endTime: number }[];

    const conflicts = new Set<string>();
    for (const occurrence of occurrences) {
      for (const appointment of existingAppointments) {
        if (hasOverlap(occurrence.start, occurrence.end, appointment.startTime, appointment.endTime)) conflicts.add(appointment.id);
      }
      for (const blocker of existingBlockers) {
        if (hasOverlap(occurrence.start, occurrence.end, blocker.startTime, blocker.endTime)) conflicts.add(blocker.id);
      }
    }
    if (conflicts.size > 0) {
      throw new Error(`Zeitkonflikt: ${conflicts.size} Konflikte gefunden`);
    }
  }

  const now = deps.now();
  const seriesId = deps.uuid();
  const patientId = input.patientId || deps.syncPatient(input.patientName, input.contactEmail ?? null, input.contactPhone ?? null, now);
  const created: string[] = [];

  const insertAll = deps.db.transaction(() => {
    deps.db.prepare(`
      INSERT INTO appointment_series (
        id, patient_id, patient_name, first_start_time, duration_minutes, interval_weeks,
        occurrence_count, last_start_time, status, notes, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
    `).run(
      seriesId,
      patientId,
      input.patientName,
      occurrences[0].start,
      input.durationMinutes,
      input.intervalWeeks,
      input.count,
      occurrences[occurrences.length - 1].start,
      input.notes ?? null,
      now,
      now
    );

    const insertAppointment = deps.db.prepare(`
      INSERT INTO appointments (
        id, patient_name, patient_id, start_time, end_time, duration_minutes, status, series_id,
        series_occurrence_index, series_original_start_time, series_exception_type,
        notes, flagged_notes, reminder_sent, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)
    `);

    for (const occurrence of occurrences) {
      const id = deps.uuid();
      insertAppointment.run(
        id,
        input.patientName,
        patientId,
        occurrence.start,
        occurrence.end,
        input.durationMinutes,
        input.status,
        seriesId,
        occurrence.index,
        occurrence.originalStart,
        input.notes ?? null,
        input.flaggedNotes ? 1 : 0,
        now,
        now
      );
      created.push(id);
    }
  });

  insertAll();
  return { seriesId, created };
}
```

- [ ] **Step 4: Run service tests**

Run:

```powershell
npx vitest run src/__tests__/unit/appointment-series.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/appointment-series.ts src/__tests__/unit/appointment-series.test.ts
git commit -m "feat: create appointment series through service"
```

---

### Task 4: Add Series Mutation Service

**Files:**
- Modify: `src/lib/appointment-series.ts`
- Modify: `src/__tests__/unit/appointment-series.test.ts`
- Modify: `src/lib/overlap.ts`

- [ ] **Step 1: Write failing mutation tests**

Append these tests to `src/__tests__/unit/appointment-series.test.ts`:

```ts
import { deleteAppointmentSeriesScope, updateAppointmentSeriesScope } from "@/lib/appointment-series";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npx vitest run src/__tests__/unit/appointment-series.test.ts
```

Expected: FAIL because mutation functions are not exported.

- [ ] **Step 3: Add conflict helper to overlap module**

In `src/lib/overlap.ts`, add this helper after `findAppointmentConflictsExcludingSeries`:

```ts
export function findAppointmentConflictsExcludingIds(
  startTimeMs: number,
  endTimeMs: number,
  excludeIds: string[]
): ConflictResult[] {
  const db = getDb();
  if (excludeIds.length === 0) return findAppointmentConflicts(startTimeMs, endTimeMs);

  const placeholders = excludeIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT id, start_time as startTime, end_time as endTime, patient_name as name
       FROM appointments
       WHERE status IN ('CONFIRMED', 'REQUESTED')
       AND start_time < ? AND end_time > ?
       AND id NOT IN (${placeholders})`
    )
    .all(endTimeMs, startTimeMs, ...excludeIds) as ConflictResult[];
}
```

- [ ] **Step 4: Implement mutation functions**

In `src/lib/appointment-series.ts`, append:

```ts
import type { AppointmentSeriesScope } from "@/lib/db/schema";

interface UpdateAppointmentSeriesInput {
  patientName?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  startTime?: number;
  durationMinutes?: number;
  status?: string;
  notes?: string | null;
  flaggedNotes?: boolean;
  force?: boolean;
}

interface SeriesAppointmentRow {
  id: string;
  patient_name: string;
  patient_id: string | null;
  start_time: number;
  end_time: number;
  duration_minutes: number;
  status: string;
  series_id: string | null;
  series_occurrence_index: number | null;
  series_original_start_time: number | null;
  notes: string | null;
}

function getAppointmentOrThrow(db: Database.Database, id: string): SeriesAppointmentRow {
  const row = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id) as SeriesAppointmentRow | undefined;
  if (!row) throw new Error("Termin nicht gefunden");
  return row;
}

function splitFutureOccurrences(
  selected: SeriesAppointmentRow,
  deps: AppointmentSeriesServiceDeps
): string {
  if (!selected.series_id || selected.series_occurrence_index === null) throw new Error("Termin gehört zu keiner Serie");
  if (selected.series_occurrence_index === 0) return selected.series_id;

  const now = deps.now();
  const newSeriesId = deps.uuid();
  const futureRows = deps.db.prepare(`
    SELECT *
    FROM appointments
    WHERE series_id = ?
      AND series_occurrence_index >= ?
    ORDER BY series_occurrence_index ASC
  `).all(selected.series_id, selected.series_occurrence_index) as SeriesAppointmentRow[];

  const firstFuture = futureRows[0];
  const lastFuture = futureRows[futureRows.length - 1];
  const originalSeries = deps.db.prepare("SELECT * FROM appointment_series WHERE id = ?").get(selected.series_id) as Record<string, unknown>;

  deps.db.prepare(`
    INSERT INTO appointment_series (
      id, patient_id, patient_name, first_start_time, duration_minutes, interval_weeks,
      occurrence_count, last_start_time, status, notes, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
  `).run(
    newSeriesId,
    firstFuture.patient_id,
    firstFuture.patient_name,
    firstFuture.start_time,
    firstFuture.duration_minutes,
    originalSeries.interval_weeks,
    futureRows.length,
    lastFuture.start_time,
    originalSeries.notes,
    now,
    now
  );

  for (let index = 0; index < futureRows.length; index++) {
    deps.db.prepare(`
      UPDATE appointments
      SET series_id = ?, series_occurrence_index = ?, updated_at = ?
      WHERE id = ?
    `).run(newSeriesId, index, now, futureRows[index].id);
  }

  deps.db.prepare(`
    UPDATE appointment_series
    SET occurrence_count = ?, last_start_time = (
      SELECT MAX(start_time) FROM appointments WHERE series_id = ?
    ), updated_at = ?
    WHERE id = ?
  `).run(selected.series_occurrence_index, selected.series_id, now, selected.series_id);

  return newSeriesId;
}

export function updateAppointmentSeriesScope(
  appointmentId: string,
  scope: AppointmentSeriesScope,
  input: UpdateAppointmentSeriesInput,
  deps: AppointmentSeriesServiceDeps = defaultAppointmentSeriesDeps()
): void {
  const selected = getAppointmentOrThrow(deps.db, appointmentId);
  const now = deps.now();

  if (scope === "single" || !selected.series_id) {
    const newStart = input.startTime ?? selected.start_time;
    const newDuration = input.durationMinutes ?? selected.duration_minutes;
    const newEnd = newStart + newDuration * 60_000;
    const moved = newStart !== selected.start_time || newDuration !== selected.duration_minutes;
    const exceptionType = moved ? "moved" : selected.series_exception_type;
    const patientId = input.patientName && input.patientName !== selected.patient_name
      ? deps.syncPatient(input.patientName, input.contactEmail ?? null, input.contactPhone ?? null, now)
      : selected.patient_id;

    if (patientId && (input.contactEmail !== undefined || input.contactPhone !== undefined)) {
      deps.updatePatientContact(patientId, input.contactEmail, input.contactPhone, now);
    }

    deps.db.prepare(`
      UPDATE appointments SET
        patient_name = COALESCE(?, patient_name),
        patient_id = COALESCE(?, patient_id),
        start_time = ?,
        end_time = ?,
        duration_minutes = ?,
        status = COALESCE(?, status),
        notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
        flagged_notes = CASE WHEN ? = 1 THEN ? ELSE flagged_notes END,
        reminder_sent = CASE WHEN ? = 1 THEN 0 ELSE reminder_sent END,
        series_exception_type = COALESCE(?, series_exception_type),
        updated_at = ?
      WHERE id = ?
    `).run(
      input.patientName ?? null,
      patientId,
      newStart,
      newEnd,
      newDuration,
      input.status ?? null,
      input.notes !== undefined ? 1 : 0,
      input.notes ?? null,
      input.flaggedNotes !== undefined ? 1 : 0,
      input.flaggedNotes ? 1 : 0,
      moved ? 1 : 0,
      exceptionType,
      now,
      appointmentId
    );
    return;
  }

  const targetSeriesId = scope === "future" ? deps.db.transaction(() => splitFutureOccurrences(selected, deps))() : selected.series_id;
  const anchor = scope === "future" ? getAppointmentOrThrow(deps.db, appointmentId) : selected;
  const timeDelta = input.startTime ? input.startTime - anchor.start_time : 0;
  const rows = deps.db.prepare(`
    SELECT *
    FROM appointments
    WHERE series_id = ?
    ORDER BY series_occurrence_index ASC
  `).all(targetSeriesId) as SeriesAppointmentRow[];

  const patientId = input.patientName && input.patientName !== anchor.patient_name
    ? deps.syncPatient(input.patientName, input.contactEmail ?? null, input.contactPhone ?? null, now)
    : anchor.patient_id;

  if (patientId && (input.contactEmail !== undefined || input.contactPhone !== undefined)) {
    deps.updatePatientContact(patientId, input.contactEmail, input.contactPhone, now);
  }

  const updateAll = deps.db.transaction(() => {
    for (const row of rows) {
      const newStart = row.start_time + timeDelta;
      const newDuration = input.durationMinutes ?? row.duration_minutes;
      deps.db.prepare(`
        UPDATE appointments SET
          patient_name = COALESCE(?, patient_name),
          patient_id = COALESCE(?, patient_id),
          start_time = ?,
          end_time = ?,
          duration_minutes = ?,
          status = COALESCE(?, status),
          notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
          flagged_notes = CASE WHEN ? = 1 THEN ? ELSE flagged_notes END,
          reminder_sent = CASE WHEN ? = 1 THEN 0 ELSE reminder_sent END,
          updated_at = ?
        WHERE id = ?
      `).run(
        input.patientName ?? null,
        patientId,
        newStart,
        newStart + newDuration * 60_000,
        newDuration,
        input.status ?? null,
        input.notes !== undefined ? 1 : 0,
        input.notes ?? null,
        input.flaggedNotes !== undefined ? 1 : 0,
        input.flaggedNotes ? 1 : 0,
        timeDelta !== 0 || input.durationMinutes ? 1 : 0,
        now,
        row.id
      );
    }

    const summary = deps.db.prepare(`
      SELECT MIN(start_time) as firstStartTime, MAX(start_time) as lastStartTime, COUNT(*) as occurrenceCount
      FROM appointments
      WHERE series_id = ?
    `).get(targetSeriesId) as { firstStartTime: number; lastStartTime: number; occurrenceCount: number };

    deps.db.prepare(`
      UPDATE appointment_series SET
        patient_name = COALESCE(?, patient_name),
        patient_id = COALESCE(?, patient_id),
        first_start_time = ?,
        duration_minutes = COALESCE(?, duration_minutes),
        occurrence_count = ?,
        last_start_time = ?,
        notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.patientName ?? null,
      patientId,
      summary.firstStartTime,
      input.durationMinutes ?? null,
      summary.occurrenceCount,
      summary.lastStartTime,
      input.notes !== undefined ? 1 : 0,
      input.notes ?? null,
      now,
      targetSeriesId
    );
  });

  updateAll();
}

export function deleteAppointmentSeriesScope(
  appointmentId: string,
  scope: AppointmentSeriesScope,
  deps: AppointmentSeriesServiceDeps = defaultAppointmentSeriesDeps()
): void {
  const selected = getAppointmentOrThrow(deps.db, appointmentId);

  if (scope === "single" || !selected.series_id) {
    deps.db.prepare("DELETE FROM appointments WHERE id = ?").run(appointmentId);
    return;
  }

  if (scope === "series") {
    const deleteAll = deps.db.transaction(() => {
      deps.db.prepare("DELETE FROM appointments WHERE series_id = ?").run(selected.series_id);
      deps.db.prepare("DELETE FROM appointment_series WHERE id = ?").run(selected.series_id);
    });
    deleteAll();
    return;
  }

  if (selected.series_occurrence_index === null) throw new Error("Termin gehört zu keiner Serie");
  const deleteFuture = deps.db.transaction(() => {
    deps.db.prepare(`
      DELETE FROM appointments
      WHERE series_id = ?
        AND series_occurrence_index >= ?
    `).run(selected.series_id, selected.series_occurrence_index);

    const remaining = deps.db.prepare(`
      SELECT COUNT(*) as count, MAX(start_time) as lastStartTime
      FROM appointments
      WHERE series_id = ?
    `).get(selected.series_id) as { count: number; lastStartTime: number | null };

    if (remaining.count === 0) {
      deps.db.prepare("DELETE FROM appointment_series WHERE id = ?").run(selected.series_id);
    } else {
      deps.db.prepare(`
        UPDATE appointment_series
        SET occurrence_count = ?, last_start_time = ?, updated_at = ?
        WHERE id = ?
      `).run(remaining.count, remaining.lastStartTime, deps.now(), selected.series_id);
    }
  });
  deleteFuture();
}
```

- [ ] **Step 5: Run mutation tests**

Run:

```powershell
npx vitest run src/__tests__/unit/appointment-series.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/appointment-series.ts src/__tests__/unit/appointment-series.test.ts src/lib/overlap.ts
git commit -m "feat: update and delete appointment series scopes"
```

---

### Task 5: Wire Appointment APIs To The Series Service

**Files:**
- Modify: `src/app/api/appointments/route.ts`
- Modify: `src/app/api/appointments/[id]/route.ts`
- Modify: `src/app/api/appointments/by-patient/route.ts`
- Modify: `src/app/api/appointments/import/route.ts`
- Modify: `src/app/api/requests/route.ts`

- [ ] **Step 1: Update appointment list mapping**

In `src/app/api/appointments/route.ts`, change the query to join `appointment_series`:

```ts
  const rows = db.prepare(
    `SELECT
       a.*,
       p.email as contact_email,
       p.phone as contact_phone,
       s.interval_weeks as series_interval_weeks,
       s.occurrence_count as series_occurrence_count,
       s.first_start_time as series_first_start_time,
       s.last_start_time as series_last_start_time
     FROM appointments a
     LEFT JOIN patients p ON p.id = a.patient_id
     LEFT JOIN appointment_series s ON s.id = a.series_id
     WHERE a.start_time < ? AND a.end_time >= ?`
  ).all(to, from) as Record<string, unknown>[];
```

Add these fields to the result object:

```ts
    seriesOccurrenceIndex: row.series_occurrence_index,
    seriesOriginalStartTime: row.series_original_start_time,
    seriesExceptionType: row.series_exception_type,
    seriesSummary: row.series_id
      ? {
          id: row.series_id,
          intervalWeeks: row.series_interval_weeks,
          occurrenceCount: row.series_occurrence_count,
          firstStartTime: row.series_first_start_time,
          lastStartTime: row.series_last_start_time,
          occurrenceIndex: row.series_occurrence_index,
          exceptionType: row.series_exception_type,
        }
      : null,
```

- [ ] **Step 2: Replace POST series creation**

In `src/app/api/appointments/route.ts`, import:

```ts
import { createAppointmentSeries } from "@/lib/appointment-series";
```

Replace the existing `if (body.series) { ... }` block with:

```ts
  if (body.series) {
    const { count, intervalWeeks } = body.series;
    const interval = intervalWeeks && [1, 2, 3, 4].includes(intervalWeeks) ? intervalWeeks : 1;
    const result = createAppointmentSeries({
      patientName,
      contactEmail,
      contactPhone,
      startTime,
      durationMinutes,
      status: appointmentStatus,
      notes: notes || null,
      flaggedNotes: notesResult.flagged,
      intervalWeeks: interval,
      count,
      force: body.force,
    });
    return Response.json(result, { status: 201 });
  }
```

Remove unused imports from `src/app/api/appointments/route.ts`:

```ts
import { v4 as uuidv4 } from "uuid";
import { createBatchConflictChecker, findAppointmentConflicts, findBlockerConflicts, hasOverlap } from "@/lib/overlap";
```

Keep `getConflictDetails` and `detectAndGroupSeries` for single-appointment behavior in this task.

- [ ] **Step 3: Update appointment detail API mapping**

In `src/app/api/appointments/[id]/route.ts`, change the GET query to join `appointment_series`:

```ts
      `SELECT
         a.*,
         p.email as contact_email,
         p.phone as contact_phone,
         s.interval_weeks as series_interval_weeks,
         s.occurrence_count as series_occurrence_count,
         s.first_start_time as series_first_start_time,
         s.last_start_time as series_last_start_time
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
       LEFT JOIN appointment_series s ON s.id = a.series_id
       WHERE a.id = ?`
```

Add the same `seriesOccurrenceIndex`, `seriesOriginalStartTime`, `seriesExceptionType`, and `seriesSummary` shape used in the list route.

- [ ] **Step 4: Replace PATCH scope handling**

In `src/app/api/appointments/[id]/route.ts`, import:

```ts
import { updateAppointmentSeriesScope, deleteAppointmentSeriesScope } from "@/lib/appointment-series";
import { normalizeSeriesScope } from "@/lib/series-rules";
```

Replace the current scope parsing:

```ts
  const scope = url.searchParams.get("scope") || "single";

  if (scope !== "single" && scope !== "series") {
    return Response.json({ error: "scope muss 'single' oder 'series' sein" }, { status: 400 });
  }
```

with:

```ts
  let scope;
  try {
    scope = normalizeSeriesScope(url.searchParams.get("scope"));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ungültiger scope" }, { status: 400 });
  }
```

After request-body validation and notes filtering, replace the current `scope === "single"` and `scope === "series"` implementation with:

```ts
  const notesFilter = body.notes !== undefined ? filterNotes(body.notes) : { flagged: false };

  try {
    updateAppointmentSeriesScope(id, scope, {
      patientName: body.patientName,
      startTime: body.startTime,
      durationMinutes: body.durationMinutes,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      notes: body.notes,
      status: body.status,
      flaggedNotes: notesFilter.flagged,
      force: body.force,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fehler beim Speichern";
    const statusCode = message.startsWith("Zeitkonflikt") ? 409 : message === "Termin nicht gefunden" ? 404 : 400;
    return Response.json({ error: message }, { status: statusCode });
  }
```

- [ ] **Step 5: Replace DELETE scope handling**

In `src/app/api/appointments/[id]/route.ts`, replace DELETE scope parsing with the same `normalizeSeriesScope` pattern. Replace delete behavior with:

```ts
  try {
    deleteAppointmentSeriesScope(id, scope);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fehler beim Löschen";
    const statusCode = message === "Termin nicht gefunden" ? 404 : 400;
    return Response.json({ error: message }, { status: statusCode });
  }
```

- [ ] **Step 6: Update by-patient mapping**

In `src/app/api/appointments/by-patient/route.ts`, add selected fields to the mapped response:

```ts
    seriesOccurrenceIndex: r.series_occurrence_index,
    seriesOriginalStartTime: r.series_original_start_time,
    seriesExceptionType: r.series_exception_type,
```

- [ ] **Step 7: Confirm request and import routes keep non-series appointments**

In `src/app/api/requests/route.ts`, keep `series_id` as `NULL` and do not add series metadata values. In `src/app/api/appointments/import/route.ts`, keep imported rows with `series_id` set to `null`; the new metadata columns default to `NULL`.

- [ ] **Step 8: Run typecheck**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS or only UI type errors that are fixed in Task 6.

- [ ] **Step 9: Commit**

```powershell
git add src/app/api/appointments/route.ts src/app/api/appointments/[id]/route.ts src/app/api/appointments/by-patient/route.ts src/app/api/appointments/import/route.ts src/app/api/requests/route.ts
git commit -m "feat: route appointment APIs through series service"
```

---

### Task 6: Redesign Appointment Form Series UI

**Files:**
- Create: `src/components/forms/SeriesFields.tsx`
- Create: `src/components/forms/SeriesSummary.tsx`
- Create: `src/components/forms/SeriesScopeDialog.tsx`
- Modify: `src/components/forms/AppointmentForm.tsx`

- [ ] **Step 1: Create recurrence fields component**

Create `src/components/forms/SeriesFields.tsx`:

```tsx
"use client";

import { formatBerlinDate, formatBerlinTime } from "@/lib/time";

interface SeriesFieldsProps {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  intervalWeeks: number;
  onIntervalWeeksChange: (value: number) => void;
  count: number;
  onCountChange: (value: number) => void;
  permanent: boolean;
  onPermanentChange: (value: boolean) => void;
  startTime: number;
  durationMinutes: number;
}

export default function SeriesFields({
  enabled,
  onEnabledChange,
  intervalWeeks,
  onIntervalWeeksChange,
  count,
  onCountChange,
  permanent,
  onPermanentChange,
  startTime,
  durationMinutes,
}: SeriesFieldsProps) {
  const effectiveCount = permanent ? 52 : count;
  const preview = Array.from({ length: Math.min(effectiveCount, 5) }, (_, index) => {
    const start = startTime + index * intervalWeeks * 7 * 86_400_000;
    return {
      start,
      end: start + durationMinutes * 60_000,
    };
  });

  return (
    <section className="border rounded-md p-3 space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} className="rounded" />
        Serientermin
      </label>

      {enabled && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Intervall</label>
            <select
              value={intervalWeeks}
              onChange={(event) => onIntervalWeeksChange(Number(event.target.value))}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>Wöchentlich</option>
              <option value={2}>Alle 2 Wochen</option>
              <option value={3}>Alle 3 Wochen</option>
              <option value={4}>Alle 4 Wochen</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input type="checkbox" checked={permanent} onChange={(event) => onPermanentChange(event.target.checked)} className="rounded" />
            Dauerpatient für 1 Jahr
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Anzahl Termine</label>
            <input
              type="number"
              min={1}
              max={52}
              value={effectiveCount}
              disabled={permanent}
              onChange={(event) => onCountChange(Math.max(1, Math.min(52, Number(event.target.value))))}
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${permanent ? "bg-gray-100 text-gray-400 cursor-not-allowed" : ""}`}
            />
          </div>

          <div className="text-xs text-gray-500 space-y-1">
            <p>{effectiveCount} Termine, {intervalWeeks === 1 ? "wöchentlich" : `alle ${intervalWeeks} Wochen`}</p>
            <ul className="space-y-1">
              {preview.map((item, index) => (
                <li key={index}>
                  {formatBerlinDate(item.start).split(",")[0]} {formatBerlinTime(item.start)}-{formatBerlinTime(item.end)}
                </li>
              ))}
            </ul>
            {effectiveCount > preview.length && <p>+ {effectiveCount - preview.length} weitere Termine</p>}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Create series summary component**

Create `src/components/forms/SeriesSummary.tsx`:

```tsx
"use client";

import { formatBerlinDate, formatBerlinTime } from "@/lib/time";

interface SeriesSummaryProps {
  summary: {
    intervalWeeks: number;
    occurrenceCount: number;
    firstStartTime: number;
    lastStartTime: number;
    occurrenceIndex: number | null;
    exceptionType: "moved" | "cancelled" | "detached" | null;
  };
}

export default function SeriesSummary({ summary }: SeriesSummaryProps) {
  const intervalLabel = summary.intervalWeeks === 1 ? "wöchentlich" : `alle ${summary.intervalWeeks} Wochen`;
  const positionLabel = summary.occurrenceIndex === null ? "" : `Termin ${summary.occurrenceIndex + 1} von ${summary.occurrenceCount}`;
  const exceptionLabel = summary.exceptionType === "moved" ? "Einzeln verschoben" : summary.exceptionType === "cancelled" ? "Einzeln abgesagt" : summary.exceptionType === "detached" ? "Aus Serie gelöst" : null;

  return (
    <section className="bg-gray-50 border rounded-md p-3 space-y-1">
      <p className="text-sm font-medium text-gray-800">Teil einer Serie</p>
      <p className="text-xs text-gray-600">
        {intervalLabel}, {summary.occurrenceCount} Termine
      </p>
      <p className="text-xs text-gray-500">
        {formatBerlinDate(summary.firstStartTime).split(",")[0]} {formatBerlinTime(summary.firstStartTime)} bis {formatBerlinDate(summary.lastStartTime).split(",")[0]}
      </p>
      {positionLabel && <p className="text-xs text-gray-500">{positionLabel}</p>}
      {exceptionLabel && <p className="text-xs text-amber-700">{exceptionLabel}</p>}
    </section>
  );
}
```

- [ ] **Step 3: Create scope dialog component**

Create `src/components/forms/SeriesScopeDialog.tsx`:

```tsx
"use client";

import type { AppointmentSeriesScope } from "@/lib/db/schema";

interface SeriesScopeDialogProps {
  mode: "save" | "delete";
  onChoose: (scope: AppointmentSeriesScope) => void;
  onCancel: () => void;
  saving: boolean;
}

export default function SeriesScopeDialog({ mode, onChoose, onCancel, saving }: SeriesScopeDialogProps) {
  const verb = mode === "delete" ? "gelöscht" : "geändert";
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Serie bearbeiten</h3>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-700">Welche Termine sollen {verb} werden?</p>
          <button type="button" disabled={saving} onClick={() => onChoose("single")} className="w-full px-3 py-2 border rounded-md text-sm text-left hover:bg-gray-50 disabled:opacity-50">
            Nur dieser Termin
          </button>
          <button type="button" disabled={saving} onClick={() => onChoose("future")} className="w-full px-3 py-2 border rounded-md text-sm text-left hover:bg-gray-50 disabled:opacity-50">
            Dieser und folgende Termine
          </button>
          <button type="button" disabled={saving} onClick={() => onChoose("series")} className="w-full px-3 py-2 border rounded-md text-sm text-left hover:bg-gray-50 disabled:opacity-50">
            Ganze Serie
          </button>
          <button type="button" onClick={onCancel} className="w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md">
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Integrate components into AppointmentForm**

In `src/components/forms/AppointmentForm.tsx`, add imports:

```tsx
import SeriesFields from "@/components/forms/SeriesFields";
import SeriesScopeDialog from "@/components/forms/SeriesScopeDialog";
import SeriesSummary from "@/components/forms/SeriesSummary";
import type { AppointmentSeriesScope } from "@/lib/db/schema";
```

Replace `editScope` state with:

```tsx
  const [pendingScopeAction, setPendingScopeAction] = useState<"save" | "delete" | null>(null);
```

Keep `isSeries`, `seriesCount`, `seriesInterval`, and `isPermanent`.

In `handleSubmit`, before building `scopeParam`, add:

```tsx
      if (isEdit && appointment.seriesId && !pendingScopeAction) {
        setPendingScopeAction("save");
        return;
      }
```

Extract the save request into a helper inside the component:

```tsx
  async function submitWithScope(scope: AppointmentSeriesScope | null) {
    const startTimeMs = dateTimeToEpoch(date, time);
    const payload: Record<string, unknown> = {
      patientName,
      patientId: patientId || undefined,
      startTime: startTimeMs,
      durationMinutes: duration,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      notes: notes || undefined,
      status,
    };
    if (!isEdit && isSeries) {
      payload.series = { count: isPermanent ? 52 : seriesCount, intervalWeeks: seriesInterval };
    }
    const scopeParam = isEdit && appointment?.seriesId && scope ? `?scope=${scope}` : "";
    const url = isEdit ? `/api/appointments/${appointment!.id}${scopeParam}` : "/api/appointments";
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { res, payload, url, method };
  }
```

Update `handleSubmit` to call `submitWithScope(null)` for new appointments and non-series edits. Update the scope dialog `onChoose` handler to call `submitWithScope(scope)`.

Replace the old inline series creation UI block with:

```tsx
          {!isEdit && (
            <SeriesFields
              enabled={isSeries}
              onEnabledChange={setIsSeries}
              intervalWeeks={seriesInterval}
              onIntervalWeeksChange={setSeriesInterval}
              count={seriesCount}
              onCountChange={setSeriesCount}
              permanent={isPermanent}
              onPermanentChange={setIsPermanent}
              startTime={dateTimeToEpoch(date, time)}
              durationMinutes={duration}
            />
          )}
```

Replace the old `editScope` radio block with:

```tsx
          {isEdit && appointment.seriesSummary && (
            <SeriesSummary summary={appointment.seriesSummary} />
          )}
```

Render the dialog near the conflict dialog:

```tsx
      {pendingScopeAction && (
        <SeriesScopeDialog
          mode={pendingScopeAction}
          saving={saving}
          onCancel={() => setPendingScopeAction(null)}
          onChoose={(scope) => {
            setPendingScopeAction(null);
            if (pendingScopeAction === "delete") {
              handleDelete(scope);
            } else {
              void submitScopedSave(scope);
            }
          }}
        />
      )}
```

Add `submitScopedSave`:

```tsx
  async function submitScopedSave(scope: AppointmentSeriesScope) {
    setSaving(true);
    setError("");
    try {
      const { res, payload, url, method } = await submitWithScope(scope);
      if (res.status === 409) {
        const data = await res.json();
        setConflictMessage(data.error || "Dieser Zeitraum ist bereits belegt.");
        setConflictDetails(data.conflictDetails || []);
        setPendingPayload({ url, method, body: payload });
        setShowConflict(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Speichern");
        return;
      }
      onSave();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }
```

Change the delete button confirmation so a series appointment opens the scope dialog:

```tsx
                    if (appointment?.seriesId) {
                      setPendingScopeAction("delete");
                    } else {
                      handleDelete("single");
                    }
```

- [ ] **Step 5: Run typecheck**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Run lint**

Run:

```powershell
npx eslint src/components/forms/AppointmentForm.tsx src/components/forms/SeriesFields.tsx src/components/forms/SeriesSummary.tsx src/components/forms/SeriesScopeDialog.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/components/forms/AppointmentForm.tsx src/components/forms/SeriesFields.tsx src/components/forms/SeriesSummary.tsx src/components/forms/SeriesScopeDialog.tsx
git commit -m "feat: clarify appointment series form workflow"
```

---

### Task 7: Improve Conflict Responses For Series Operations

**Files:**
- Modify: `src/lib/appointment-series.ts`
- Modify: `src/app/api/appointments/route.ts`
- Modify: `src/app/api/appointments/[id]/route.ts`
- Modify: `src/components/forms/AppointmentForm.tsx`

- [ ] **Step 1: Add structured conflict error type**

In `src/lib/appointment-series.ts`, add near the top:

```ts
export interface AppointmentSeriesConflictDetail {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  type: "appointment" | "blocker";
}

export class AppointmentSeriesConflictError extends Error {
  constructor(public readonly conflictDetails: AppointmentSeriesConflictDetail[]) {
    super(`Zeitkonflikt: ${conflictDetails.length} Konflikte gefunden`);
  }
}
```

In `createAppointmentSeries`, replace the `Set` conflict collection with a `Map<string, AppointmentSeriesConflictDetail>` and throw:

```ts
      throw new AppointmentSeriesConflictError([...conflicts.values()]);
```

- [ ] **Step 2: Return conflict details from POST route**

In `src/app/api/appointments/route.ts`, import:

```ts
import { AppointmentSeriesConflictError, createAppointmentSeries } from "@/lib/appointment-series";
```

Wrap `createAppointmentSeries`:

```ts
    try {
      const result = createAppointmentSeries({
        patientName,
        contactEmail,
        contactPhone,
        startTime,
        durationMinutes,
        status: appointmentStatus,
        notes: notes || null,
        flaggedNotes: notesResult.flagged,
        intervalWeeks: interval,
        count,
        force: body.force,
      });
      return Response.json(result, { status: 201 });
    } catch (error) {
      if (error instanceof AppointmentSeriesConflictError) {
        return Response.json({ error: error.message, conflictDetails: error.conflictDetails }, { status: 409 });
      }
      return Response.json({ error: error instanceof Error ? error.message : "Fehler beim Erstellen der Serie" }, { status: 400 });
    }
```

- [ ] **Step 3: Return conflict details from PATCH route**

In `src/app/api/appointments/[id]/route.ts`, import `AppointmentSeriesConflictError`. In the catch block around `updateAppointmentSeriesScope`, add:

```ts
    if (error instanceof AppointmentSeriesConflictError) {
      return Response.json({ error: error.message, conflictDetails: error.conflictDetails }, { status: 409 });
    }
```

- [ ] **Step 4: Keep UI conflict modal but improve copy**

In `src/components/forms/AppointmentForm.tsx`, change the conflict modal paragraph to:

```tsx
                {conflictMessage || "Ein oder mehrere Termine überschneiden sich."} Du kannst abbrechen oder die Serie trotzdem speichern.
```

Change the list footer to:

```tsx
                    <p className="text-xs text-gray-500">+ {conflictDetails.length - 10} weitere Konflikte in dieser Serie</p>
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```powershell
npm test
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/appointment-series.ts src/app/api/appointments/route.ts src/app/api/appointments/[id]/route.ts src/components/forms/AppointmentForm.tsx
git commit -m "feat: return structured series conflict details"
```

---

### Task 8: Remove Implicit Series Auto-Grouping From Normal Saves

**Files:**
- Modify: `src/app/api/appointments/route.ts`
- Modify: `src/app/api/appointments/[id]/route.ts`
- Modify: `src/lib/series-detect.ts`
- Modify: `src/app/api/admin/detect-series/route.ts`

- [ ] **Step 1: Stop auto-detecting series after ordinary appointment writes**

In `src/app/api/appointments/route.ts`, remove:

```ts
import { detectAndGroupSeries } from "@/lib/series-detect";
```

Remove:

```ts
  detectAndGroupSeries(patientName);
```

In `src/app/api/appointments/[id]/route.ts`, remove:

```ts
import { detectAndGroupSeries } from "@/lib/series-detect";
```

Remove the block:

```ts
    const pName = body.patientName || (existing.patient_name as string);
    detectAndGroupSeries(pName);
    if (body.patientName && body.patientName !== existing.patient_name) {
      detectAndGroupSeries(existing.patient_name as string);
    }
```

- [ ] **Step 2: Keep admin detection as explicit migration utility**

In `src/lib/series-detect.ts`, update the function comment above `detectAndGroupSeries`:

```ts
/**
 * Detect and group legacy series for a single patient.
 * This is an explicit admin migration utility, not part of normal appointment saves.
 */
```

In `src/app/api/admin/detect-series/route.ts`, update the route comment:

```ts
// Explicit admin migration: detect and group legacy ungrouped appointments.
```

- [ ] **Step 3: Run typecheck**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/app/api/appointments/route.ts src/app/api/appointments/[id]/route.ts src/lib/series-detect.ts src/app/api/admin/detect-series/route.ts
git commit -m "refactor: make legacy series detection explicit"
```

---

### Task 9: Document And Verify End-To-End

**Files:**
- Modify: `docs/codebase-overview.md`

- [ ] **Step 1: Update documentation**

In `docs/codebase-overview.md`, replace the current series bullets in the "Termin-Flow" section with:

```md
Serientermine:

- Serien haben einen eigenen Datensatz in `appointment_series`.
- Einzelne Kalendertermine bleiben in `appointments` materialisiert.
- `appointments.series_id` verweist auf `appointment_series.id`.
- `appointments.series_occurrence_index` speichert die Position innerhalb der Serie.
- `appointments.series_original_start_time` speichert den ursprünglich geplanten Zeitpunkt.
- `appointments.series_exception_type` markiert Einzelabweichungen wie `moved`, `cancelled` oder `detached`.
- Bearbeitung und Löschung unterstützen `scope=single|future|series`.
- `scope=future` teilt die Serie ab dem ausgewählten Termin in eine neue Serie und ändert nur diese neue Teilserie.
- Automatische Serienerkennung ist nur noch ein explizites Admin-Migrationstool unter `/api/admin/detect-series`.
```

- [ ] **Step 2: Run all unit tests**

Run:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```powershell
npm run build
```

Expected: PASS. If `next/font` fails due network access to Google Fonts, record the exact error and use the successful `npx tsc --noEmit` result as the local type/build proxy.

- [ ] **Step 5: Manual QA in browser**

Run:

```powershell
npm run dev
```

Open `http://localhost:3000/dashboard` and verify:

- Creating a single appointment still works.
- Creating a weekly series with 3 appointments creates 3 visible calendar appointments.
- Creating a 52-appointment Dauerpatient series shows a useful preview before save.
- Editing one occurrence shifts only that occurrence and shows the moved exception summary.
- Editing "Dieser und folgende Termine" leaves earlier occurrences unchanged and shifts later ones.
- Editing "Ganze Serie" shifts all occurrences.
- Deleting one occurrence removes only that appointment.
- Deleting "Dieser und folgende Termine" removes selected and later appointments.
- Deleting "Ganze Serie" removes all appointments for that series.
- Creating a series that overlaps an existing appointment shows conflict details and does not save until "Trotzdem speichern" is used.

- [ ] **Step 6: Commit**

```powershell
git add docs/codebase-overview.md
git commit -m "docs: document appointment series model"
```

---

## Self-Review

- Spec coverage: The plan covers the recommended model with `appointment_series`, materialized appointments, explicit edit scopes, UI summary, conflict review, migration of existing grouped data, and removal of implicit auto-grouping from normal saves.
- Placeholder scan: The plan contains concrete file paths, code blocks, commands, expected outcomes, and no placeholder sections.
- Type consistency: The plan uses `seriesOccurrenceIndex`, `seriesOriginalStartTime`, `seriesExceptionType`, `seriesSummary`, `AppointmentSeriesScope`, and `appointmentSeries` consistently across schema, service, APIs, and UI components.

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-06-03-appointment-series-model.md`. Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

