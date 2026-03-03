-- Add 90 minutes as allowed duration
-- SQLite cannot ALTER CHECK constraints, so we recreate the table

CREATE TABLE `appointments_new` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_name` text NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`duration_minutes` integer NOT NULL CHECK(`duration_minutes` IN (15, 30, 45, 60, 90)),
	`status` text NOT NULL CHECK(`status` IN ('REQUESTED', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
	`series_id` text,
	`contact_email` text,
	`contact_phone` text,
	`notes` text,
	`flagged_notes` integer DEFAULT 0 NOT NULL,
	`reminder_sent` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CHECK(`end_time` > `start_time`),
	CHECK((`end_time` - `start_time`) = `duration_minutes` * 60000)
);
--> statement-breakpoint
INSERT INTO `appointments_new` SELECT * FROM `appointments`;
--> statement-breakpoint
DROP TABLE `appointments`;
--> statement-breakpoint
ALTER TABLE `appointments_new` RENAME TO `appointments`;
--> statement-breakpoint
CREATE INDEX `idx_appointments_time_status` ON `appointments` (`start_time`,`end_time`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_appointments_series` ON `appointments` (`series_id`);
--> statement-breakpoint
CREATE INDEX `idx_appointments_created_status` ON `appointments` (`created_at`,`status`);
