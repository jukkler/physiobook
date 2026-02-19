import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { adminUsers } from "./db/schema";

const COOKIE_NAME = "physiobook_session";
const JWT_SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-in-production"
);
const JWT_EXPIRY = "7d";

export interface Session {
  userId: string;
  username: string;
  tokenVersion: number;
}

// --- JWT helpers ---

export async function signToken(payload: Session): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(JWT_EXPIRY)
    .setIssuedAt()
    .sign(JWT_SECRET_KEY);
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY);
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

// --- Edge-compatible: JWT signature + expiry only (no DB) ---

export async function verifyTokenSignature(
  token: string
): Promise<Session | null> {
  return verifyToken(token);
}

// --- Server-side: full session verification with tokenVersion check ---

export async function verifySession(
  req: Request
): Promise<Session | null> {
  const cookieHeader = req.headers.get("cookie") || "";
  const token = parseCookieValue(cookieHeader, COOKIE_NAME);
  if (!token) return null;

  const session = await verifyToken(token);
  if (!session) return null;

  // Check tokenVersion against DB
  const db = drizzle(getDb());
  const [user] = await db
    .select({ tokenVersion: adminUsers.tokenVersion })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.userId))
    .limit(1);

  if (!user || user.tokenVersion !== session.tokenVersion) return null;

  return session;
}

// --- Server Component variant: reads from Next.js cookies() ---

export async function verifySessionFromCookies(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await verifyToken(token);
  if (!session) return null;

  // Check tokenVersion against DB
  const db = drizzle(getDb());
  const [user] = await db
    .select({ tokenVersion: adminUsers.tokenVersion })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.userId))
    .limit(1);

  if (!user || user.tokenVersion !== session.tokenVersion) return null;

  return session;
}

// --- Cookie helpers ---

export function createSessionCookie(token: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${7 * 24 * 60 * 60}`,
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

// --- Auth wrapper for API route handlers ---

type AuthenticatedHandler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
  session: Session
) => Promise<Response>;

export function withApiAuth(handler: AuthenticatedHandler) {
  return async (
    req: Request,
    ctx: { params: Promise<Record<string, string>> }
  ): Promise<Response> => {
    const session = await verifySession(req);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(req, ctx, session);
  };
}

// --- Utility ---

function parseCookieValue(cookieHeader: string, name: string): string | null {
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? match.substring(name.length + 1) : null;
}
