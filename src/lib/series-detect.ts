import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { getBerlinWeekdayAndMinute } from "./time";

const ALLOWED_INTERVALS = [7, 14, 21, 28];
const MIN_RUN_LENGTH = 3;
const MS_PER_DAY = 86_400_000;

interface Candidate {
  id: string;
  startTime: number;
}

/**
 * Detect and group series for a single patient.
 * Finds 3+ ungrouped appointments at the same weekday+time with regular intervals.
 */
export function detectAndGroupSeries(patientName: string): void {
  const db = getDb();

  // Step 1: Load ungrouped candidates for this patient
  const candidates = db
    .prepare(
      `SELECT id, start_time as startTime
       FROM appointments
       WHERE patient_name = ?
         AND series_id IS NULL
         AND status IN ('CONFIRMED', 'REQUESTED')
       ORDER BY start_time ASC`
    )
    .all(patientName) as Candidate[];

  if (candidates.length < MIN_RUN_LENGTH) return;

  // Step 2: Group by (weekday, minuteOfDay) in Berlin TZ
  const buckets = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const { weekday, minute } = getBerlinWeekdayAndMinute(c.startTime);
    const key = `${weekday}-${minute}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(c);
  }

  const now = Date.now();

  // Step 3: For each bucket with enough candidates, find regular-interval runs
  for (const [, bucket] of buckets) {
    if (bucket.length < MIN_RUN_LENGTH) continue;

    // Compute day-gaps between consecutive appointments
    const gaps: number[] = [];
    for (let i = 1; i < bucket.length; i++) {
      gaps.push(Math.round((bucket[i].startTime - bucket[i - 1].startTime) / MS_PER_DAY));
    }

    // Find contiguous runs with a uniform allowed interval
    const runs: Candidate[][] = [];
    let currentRun: Candidate[] = [bucket[0]];
    let currentGap = gaps[0];

    for (let i = 1; i < bucket.length; i++) {
      if (gaps[i - 1] === currentGap) {
        currentRun.push(bucket[i]);
      } else {
        // End current run, check if it qualifies
        if (currentRun.length >= MIN_RUN_LENGTH && ALLOWED_INTERVALS.includes(currentGap)) {
          runs.push(currentRun);
        }
        currentRun = [bucket[i]];
        currentGap = i < gaps.length ? gaps[i] : 0;
      }
    }
    // Don't forget the last run
    if (currentRun.length >= MIN_RUN_LENGTH && ALLOWED_INTERVALS.includes(currentGap)) {
      runs.push(currentRun);
    }

    // Step 4: Assign series_id to each qualifying run
    for (const run of runs) {
      const seriesId = uuidv4();
      const placeholders = run.map(() => "?").join(",");
      db.prepare(
        `UPDATE appointments SET series_id = ?, updated_at = ? WHERE id IN (${placeholders})`
      ).run(seriesId, now, ...run.map((r) => r.id));
    }
  }
}

/**
 * Run series detection for ALL patients with ungrouped appointments.
 * Intended as a one-time migration for existing data.
 */
export function detectAllSeries(): { grouped: number } {
  const db = getDb();

  const patients = db
    .prepare(
      `SELECT DISTINCT patient_name as name
       FROM appointments
       WHERE series_id IS NULL
         AND status IN ('CONFIRMED', 'REQUESTED')`
    )
    .all() as { name: string }[];

  // Count how many appointments get grouped
  const beforeCount = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM appointments WHERE series_id IS NOT NULL`
      )
      .get() as { count: number }
  ).count;

  for (const p of patients) {
    detectAndGroupSeries(p.name);
  }

  const afterCount = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM appointments WHERE series_id IS NOT NULL`
      )
      .get() as { count: number }
  ).count;

  return { grouped: afterCount - beforeCount };
}
