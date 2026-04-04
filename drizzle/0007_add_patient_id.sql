-- Ensure every appointment's patient_name has a matching patients record
INSERT OR IGNORE INTO patients (id, name, email, phone, created_at, updated_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  a.patient_name,
  a.contact_email,
  a.contact_phone,
  MIN(a.created_at),
  MAX(a.updated_at)
FROM appointments a
LEFT JOIN patients p ON p.name = a.patient_name COLLATE NOCASE
WHERE p.id IS NULL
GROUP BY a.patient_name COLLATE NOCASE;
--> statement-breakpoint
UPDATE patients SET
  email = COALESCE(email, (SELECT contact_email FROM appointments WHERE patient_name = patients.name COLLATE NOCASE AND contact_email IS NOT NULL LIMIT 1)),
  phone = COALESCE(phone, (SELECT contact_phone FROM appointments WHERE patient_name = patients.name COLLATE NOCASE AND contact_phone IS NOT NULL LIMIT 1))
WHERE email IS NULL OR phone IS NULL;
--> statement-breakpoint
CREATE TABLE `appointments_new` (
  `id` text PRIMARY KEY NOT NULL,
  `patient_name` text NOT NULL,
  `patient_id` text,
  `start_time` integer NOT NULL,
  `end_time` integer NOT NULL,
  `duration_minutes` integer NOT NULL CHECK(`duration_minutes` IN (15, 30, 45, 60, 90)),
  `status` text NOT NULL CHECK(`status` IN ('REQUESTED', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  `series_id` text,
  `notes` text,
  `flagged_notes` integer DEFAULT 0 NOT NULL,
  `reminder_sent` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CHECK(`end_time` > `start_time`),
  CHECK((`end_time` - `start_time`) = `duration_minutes` * 60000)
);
--> statement-breakpoint
INSERT INTO `appointments_new` (`id`, `patient_name`, `patient_id`, `start_time`, `end_time`, `duration_minutes`, `status`, `series_id`, `notes`, `flagged_notes`, `reminder_sent`, `created_at`, `updated_at`)
SELECT
  a.`id`, a.`patient_name`, p.`id`, a.`start_time`, a.`end_time`, a.`duration_minutes`, a.`status`, a.`series_id`, a.`notes`, a.`flagged_notes`, a.`reminder_sent`, a.`created_at`, a.`updated_at`
FROM `appointments` a
LEFT JOIN `patients` p ON p.`name` = a.`patient_name` COLLATE NOCASE;
--> statement-breakpoint
DROP TABLE `appointments`;
--> statement-breakpoint
ALTER TABLE `appointments_new` RENAME TO `appointments`;
--> statement-breakpoint
CREATE INDEX `idx_appointments_time_status` ON `appointments` (`start_time`, `end_time`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_appointments_series` ON `appointments` (`series_id`);
--> statement-breakpoint
CREATE INDEX `idx_appointments_patient_series` ON `appointments` (`patient_name`, `series_id`);
--> statement-breakpoint
CREATE INDEX `idx_appointments_created_status` ON `appointments` (`created_at`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_appointments_patient_id` ON `appointments` (`patient_id`);
