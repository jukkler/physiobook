import { NextRequest } from "next/server";
import { compareSync } from "bcryptjs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { signToken, createSessionCookie } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { checkLoginAllowed, recordLoginAttempt } from "@/lib/login-guard";

export async function POST(req: NextRequest) {
  // CSRF check
  const csrf = checkCsrf(req);
  if (!csrf.ok) {
    return Response.json({ error: csrf.error }, { status: 403 });
  }

  // In-memory rate limit by IP (quick check)
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Zu viele Anfragen. Bitte warten." },
      { status: 429 }
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Ungültige Anfrage" },
      { status: 400 }
    );
  }

  const { username, password } = body;
  if (!username || !password) {
    return Response.json(
      { error: "Benutzername und Passwort erforderlich" },
      { status: 400 }
    );
  }

  // DB-based lockout check
  const lockout = await checkLoginAllowed(ip, username);
  if (!lockout.allowed) {
    return Response.json(
      { error: "Zu viele fehlgeschlagene Anmeldeversuche. Bitte warten." },
      { status: 429 }
    );
  }

  // Verify credentials
  const db = drizzle(getDb());
  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.username, username))
    .limit(1);

  // Constant-time-ish response: don't reveal if username exists
  if (!user || !compareSync(password, user.passwordHash)) {
    await recordLoginAttempt(ip, username, false);
    return Response.json(
      { error: "Ungültige Anmeldedaten" },
      { status: 401 }
    );
  }

  // Success
  await recordLoginAttempt(ip, username, true);

  const token = await signToken({
    userId: user.id,
    username: user.username,
    tokenVersion: user.tokenVersion,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": createSessionCookie(token),
    },
  });
}
