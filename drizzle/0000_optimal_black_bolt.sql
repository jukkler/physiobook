CREATE TABLE `admin_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`token_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_username_unique` ON `admin_users` (`username`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_name` text NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`duration_minutes` integer NOT NULL CHECK(`duration_minutes` IN (15, 30, 45, 60)),
	`status` text NOT NULL CHECK(`status` IN ('REQUESTED', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
	`series_id` text,
	`contact_email` text,
	`contact_phone` text,
	`notes` text,
	`flagged_notes` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CHECK(`end_time` > `start_time`),
	CHECK((`end_time` - `start_time`) = `duration_minutes` * 60000)
);
--> statement-breakpoint
CREATE INDEX `idx_appointments_time_status` ON `appointments` (`start_time`,`end_time`,`status`);--> statement-breakpoint
CREATE INDEX `idx_appointments_series` ON `appointments` (`series_id`);--> statement-breakpoint
CREATE INDEX `idx_appointments_created_status` ON `appointments` (`created_at`,`status`);--> statement-breakpoint
CREATE TABLE `blockers` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`blocker_group_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_blockers_time` ON `blockers` (`start_time`,`end_time`);--> statement-breakpoint
CREATE INDEX `idx_blockers_group` ON `blockers` (`blocker_group_id`);--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`to_address` text NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier_hash` text NOT NULL,
	`attempt_type` text NOT NULL,
	`attempted_at` integer NOT NULL,
	`success` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_login_attempts_lookup` ON `login_attempts` (`identifier_hash`,`attempt_type`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
