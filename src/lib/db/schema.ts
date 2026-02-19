import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// --- Appointments ---

export const appointments = sqliteTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    patientName: text("patient_name").notNull(),
    startTime: integer("start_time").notNull(), // epoch ms (UTC)
    endTime: integer("end_time").notNull(), // epoch ms (UTC), persisted
    durationMinutes: integer("duration_minutes").notNull(),
    status: text("status", {
      enum: ["REQUESTED", "CONFIRMED", "CANCELLED", "EXPIRED"],
    }).notNull(),
    seriesId: text("series_id"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    notes: text("notes"), // admin-only, max 200 chars, server-filtered
    flaggedNotes: integer("flagged_notes").notNull().default(0),
    createdAt: integer("created_at").notNull(), // epoch ms
    updatedAt: integer("updated_at").notNull(), // epoch ms
  },
  (table) => [
    index("idx_appointments_time_status").on(
      table.startTime,
      table.endTime,
      table.status
    ),
    index("idx_appointments_series").on(table.seriesId),
    index("idx_appointments_created_status").on(
      table.createdAt,
      table.status
    ),
  ]
);

// --- Blockers ---

export const blockers = sqliteTable(
  "blockers",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    startTime: integer("start_time").notNull(), // epoch ms (UTC)
    endTime: integer("end_time").notNull(), // epoch ms (UTC)
    blockerGroupId: text("blocker_group_id"),
    createdAt: integer("created_at").notNull(), // epoch ms
  },
  (table) => [
    index("idx_blockers_time").on(table.startTime, table.endTime),
    index("idx_blockers_group").on(table.blockerGroupId),
  ]
);

// --- Admin Users ---

export const adminUsers = sqliteTable("admin_users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  tokenVersion: integer("token_version").notNull().default(1),
  createdAt: integer("created_at").notNull(), // epoch ms
});

// --- Login Attempts (DB-based rate limiting) ---

export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    id: text("id").primaryKey(),
    identifierHash: text("identifier_hash").notNull(), // SHA-256(IP/username + salt)
    attemptType: text("attempt_type", { enum: ["IP", "USERNAME"] }).notNull(),
    attemptedAt: integer("attempted_at").notNull(), // epoch ms
    success: integer("success").notNull(), // 0 or 1
  },
  (table) => [
    index("idx_login_attempts_lookup").on(
      table.identifierHash,
      table.attemptType,
      table.attemptedAt
    ),
  ]
);

// --- Settings (app config only, no credentials) ---

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// --- Email Outbox ---

export const emailOutbox = sqliteTable("email_outbox", {
  id: text("id").primaryKey(),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  status: text("status", {
    enum: ["PENDING", "SENT", "FAILED"],
  }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: integer("created_at").notNull(), // epoch ms
  sentAt: integer("sent_at"), // epoch ms, nullable
});

// --- Type exports ---

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
export type Blocker = typeof blockers.$inferSelect;
export type NewBlocker = typeof blockers.$inferInsert;
export type AdminUser = typeof adminUsers.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type EmailOutboxEntry = typeof emailOutbox.$inferSelect;

// --- CHECK constraints applied via custom SQL in migration ---
// CHECK(end_time > start_time)
// CHECK((end_time - start_time) = duration_minutes * 60000)
// CHECK(duration_minutes IN (15, 30, 45, 60))
// CHECK(status IN ('REQUESTED','CONFIRMED','CANCELLED','EXPIRED'))
// These are added as raw SQL in the migration file after generation.
