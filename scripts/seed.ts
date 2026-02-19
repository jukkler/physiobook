import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { hashSync } from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { adminUsers, settings } from "../src/lib/db/schema";

const DB_PATH = process.env.DATABASE_PATH || "./physiobook.sqlite";

const db = new Database(path.resolve(DB_PATH));
db.pragma("journal_mode = WAL");

const drizzleDb = drizzle(db);

console.log("Seeding database...");

// Create default admin user (username: admin, password: admin)
const existingAdmin = db
  .prepare("SELECT id FROM admin_users LIMIT 1")
  .get();

if (!existingAdmin) {
  drizzleDb.insert(adminUsers).values({
    id: uuidv4(),
    username: "admin",
    passwordHash: hashSync("admin", 12),
    tokenVersion: 1,
    createdAt: Date.now(),
  }).run();
  console.log('Created default admin user (username: "admin", password: "admin")');
  console.log("WARNING: Change the default password immediately!");
} else {
  console.log("Admin user already exists, skipping.");
}

// Insert default settings
const defaultSettings: Record<string, string> = {
  morningStart: "08:00",
  morningEnd: "13:00",
  afternoonStart: "13:00",
  afternoonEnd: "20:00",
  slotDuration: "30",
  requestTimeoutHours: "48",
  retentionDaysExpired: "30",
  retentionDaysPast: "90",
};

for (const [key, value] of Object.entries(defaultSettings)) {
  drizzleDb
    .insert(settings)
    .values({ key, value })
    .onConflictDoNothing()
    .run();
}
console.log("Default settings inserted.");

db.close();
console.log("Seed complete.");
