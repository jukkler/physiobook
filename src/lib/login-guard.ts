import { createHash } from "crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, gt } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { loginAttempts } from "./db/schema";

const LOGIN_SALT = process.env.LOGIN_SALT || "dev-salt";
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value + LOGIN_SALT).digest("hex");
}

export async function checkLoginAllowed(
  ip: string,
  username: string
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const db = drizzle(getDb());
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const ipHash = hashIdentifier(ip);
  const usernameHash = hashIdentifier(username);

  // Count recent failed attempts by IP
  const ipAttempts = await db
    .select()
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.identifierHash, ipHash),
        eq(loginAttempts.attemptType, "IP"),
        gt(loginAttempts.attemptedAt, windowStart),
        eq(loginAttempts.success, 0)
      )
    );

  if (ipAttempts.length >= MAX_ATTEMPTS) {
    const oldest = ipAttempts[0].attemptedAt;
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) };
  }

  // Count recent failed attempts by username
  const usernameAttempts = await db
    .select()
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.identifierHash, usernameHash),
        eq(loginAttempts.attemptType, "USERNAME"),
        gt(loginAttempts.attemptedAt, windowStart),
        eq(loginAttempts.success, 0)
      )
    );

  if (usernameAttempts.length >= MAX_ATTEMPTS) {
    const oldest = usernameAttempts[0].attemptedAt;
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) };
  }

  return { allowed: true };
}

export async function recordLoginAttempt(
  ip: string,
  username: string,
  success: boolean
): Promise<void> {
  const db = drizzle(getDb());
  const now = Date.now();

  // Record IP attempt
  await db.insert(loginAttempts).values({
    id: uuidv4(),
    identifierHash: hashIdentifier(ip),
    attemptType: "IP",
    attemptedAt: now,
    success: success ? 1 : 0,
  });

  // Record username attempt
  await db.insert(loginAttempts).values({
    id: uuidv4(),
    identifierHash: hashIdentifier(username),
    attemptType: "USERNAME",
    attemptedAt: now,
    success: success ? 1 : 0,
  });
}
