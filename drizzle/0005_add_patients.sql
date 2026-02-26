CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_patients_name` ON `patients` (`name`);
--> statement-breakpoint
INSERT INTO patients (id, name, email, phone, created_at, updated_at)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  patient_name,
  contact_email,
  contact_phone,
  MIN(created_at),
  MAX(updated_at)
FROM appointments
GROUP BY patient_name
HAVING patient_name IS NOT NULL AND patient_name != '';
