import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "path";
import { validateEnv } from "@/lib/env";

const DB_PATH = process.env.DATABASE_PATH || "./physiobook.sqlite";

let db: Database.Database;
let ormDb: BetterSQLite3Database;
let envValidated = false;

export function getDb(): Database.Database {
  if (!envValidated) {
    validateEnv();
    envValidated = true;
  }
  if (!db) {
    // Laufzeitpfad aus der Umgebung: nicht vom Build-Tracing erfassen lassen,
    // sonst kopiert Next.js das ganze Projekt bzw. die Datenbank nach .next/standalone
    db = new Database(path.resolve(/* turbopackIgnore: true */ DB_PATH));
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

/**
 * Drizzle ORM singleton. Use for all typed queries.
 * For raw transactions (especially .immediate()), use getDb() directly.
 */
export function getOrmDb(): BetterSQLite3Database {
  if (!ormDb) {
    ormDb = drizzle(getDb());
  }
  return ormDb;
}
