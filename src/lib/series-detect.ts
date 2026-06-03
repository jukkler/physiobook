import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { getBerlinWeekdayAndMinute } from "./time";

const ALLOWED_INTERVALS = [7, 14, 21, 28];
const MIN_RUN_LENGTH = 3;
const MS_PER_DAY = 86_400_000;

interface Candidate {
  id: string;
  patientId: string | null;
  startTime: number;
  durationMinutes: number;
  notes: string | null;
  createdAt: number;
}

/**
 * Detect and group legacy series for a single patient.
 * This is an explicit admin migration utility, not part of normal appointment saves.
 */
export function detectAndGroupSeries(patientName: string): void {
  const db = getDb();

  // Step 1: Load ungrouped candidates for this patient
  const candidates = db
    .prepare(
      `SELECT id,
              patient_id as patientId,
              start_time as startTime,
              duration_minutes as durationMinutes,
              notes,
              created_at as createdAt
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
    const roundedMinute = Math.round(minute / 5) * 5;
    const key = `${weekday}-${roundedMinute}-${c.durationMinutes}`;
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
    const runs: { candidates: Candidate[]; gap: number }[] = [];
    let currentRun: Candidate[] = [bucket[0]];
    let currentGap = gaps[0];

    for (let i = 1; i < bucket.length; i++) {
      if (gaps[i - 1] === currentGap) {
        currentRun.push(bucket[i]);
      } else {
        // End current run, check if it qualifies
        if (currentRun.length >= MIN_RUN_LENGTH && ALLOWED_INTERVALS.includes(currentGap)) {
          runs.push({ candidates: currentRun, gap: currentGap });
        }
        currentRun = [bucket[i]];
        currentGap = i < gaps.length ? gaps[i] : 0;
      }
    }
    // Don't forget the last run
    if (currentRun.length >= MIN_RUN_LENGTH && ALLOWED_INTERVALS.includes(currentGap)) {
      runs.push({ candidates: currentRun, gap: currentGap });
    }

    // Step 4: Create full appointment_series rows and assign occurrence metadata
    for (const { candidates: run, gap } of runs) {
      const seriesId = uuidv4();
      const sortedRun = [...run].sort((a, b) => a.startTime - b.startTime);
      const first = sortedRun[0];
      const last = sortedRun[sortedRun.length - 1];
      const intervalWeeks = Math.round(gap / 7);

      db.transaction(() => {
        db.prepare(
          `INSERT INTO appointment_series (
             id, patient_id, patient_name, first_start_time, duration_minutes,
             interval_weeks, occurrence_count, last_start_time, status, notes,
             created_at, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`
        ).run(
          seriesId,
          first.patientId,
          patientName,
          first.startTime,
          first.durationMinutes,
          intervalWeeks,
          sortedRun.length,
          last.startTime,
          first.notes,
          Math.min(...sortedRun.map((r) => r.createdAt)),
          now
        );

        const update = db.prepare(
          `UPDATE appointments
           SET series_id = ?,
               series_occurrence_index = ?,
               series_original_start_time = start_time,
               series_exception_type = NULL,
               updated_at = ?
           WHERE id = ?`
        );

        sortedRun.forEach((appointment, index) => {
          update.run(seriesId, index, now, appointment.id);
        });
      })();
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
