import Database from "better-sqlite3";

const db = new Database("./physiobook.sqlite");

// Test CHECK constraint: invalid duration
try {
  db.prepare(`INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, flagged_notes, created_at, updated_at) VALUES ('test', 'Test', 1000, 2800000, 20, 'CONFIRMED', 0, 1000, 1000)`).run();
  console.log("FAIL: invalid duration_minutes accepted");
} catch (e: any) {
  console.log("PASS: invalid duration rejected:", e.message);
}

// Test CHECK constraint: endTime <= startTime
try {
  db.prepare(`INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, flagged_notes, created_at, updated_at) VALUES ('test2', 'Test', 2000, 1000, 30, 'CONFIRMED', 0, 1000, 1000)`).run();
  console.log("FAIL: endTime <= startTime accepted");
} catch (e: any) {
  console.log("PASS: endTime <= startTime rejected:", e.message);
}

// Test valid insert (30 min = 1800000 ms)
try {
  db.prepare(`INSERT INTO appointments (id, patient_name, start_time, end_time, duration_minutes, status, flagged_notes, created_at, updated_at) VALUES ('test4', 'Test', 1000, 1801000, 30, 'CONFIRMED', 0, 1000, 1000)`).run();
  console.log("PASS: valid insert accepted");
  db.prepare("DELETE FROM appointments WHERE id = ?").run("test4");
} catch (e: any) {
  console.log("FAIL: valid insert rejected:", e.message);
}

db.close();
