import Database from "better-sqlite3";
import { hashSync } from "bcryptjs";
import path from "path";

const DB_PATH = process.env.DATABASE_PATH || "./physiobook.sqlite";
const newPassword = process.argv[2];

if (!newPassword) {
  console.error("Usage: npx tsx scripts/reset-password.ts <new-password>");
  process.exit(1);
}

if (newPassword.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const db = new Database(path.resolve(DB_PATH));

const user = db.prepare("SELECT id, username FROM admin_users LIMIT 1").get() as
  | { id: string; username: string }
  | undefined;

if (!user) {
  console.error("No admin user found. Run seed script first.");
  db.close();
  process.exit(1);
}

const hash = hashSync(newPassword, 12);

db.prepare(
  "UPDATE admin_users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?"
).run(hash, user.id);

console.log(`Password reset for user "${user.username}".`);
console.log("All existing sessions have been invalidated (tokenVersion incremented).");

db.close();
