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
    WHEN CAST(ROUND(((
      SELECT b.`start_time`
      FROM `appointments` b
      WHERE b.`series_id` = a.`series_id`
      ORDER BY b.`start_time` ASC, b.`id` ASC
      LIMIT 1 OFFSET 1
    ) - MIN(a.`start_time`)) / 604800000.0) AS integer) IN (1, 2, 3, 4)
    THEN CAST(ROUND(((
      SELECT b.`start_time`
      FROM `appointments` b
      WHERE b.`series_id` = a.`series_id`
      ORDER BY b.`start_time` ASC, b.`id` ASC
      LIMIT 1 OFFSET 1
    ) - MIN(a.`start_time`)) / 604800000.0) AS integer)
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
