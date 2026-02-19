import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DATABASE_PATH || "./physiobook.sqlite";

const db = new Database(path.resolve(DB_PATH));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

const drizzleDb = drizzle(db);

console.log("Running migrations...");
migrate(drizzleDb, { migrationsFolder: path.resolve("./drizzle") });
console.log("Migrations complete.");

db.close();
