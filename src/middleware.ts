import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "physiobook_session";
const JWT_SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-in-production"
);

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/login",
  "/widget",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/slots",
  "/api/requests",
  "/api/health",
  "/api/cron",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Public routes: allow through
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Protected routes: check JWT signature + expiry (no DB access in Edge)
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    // Redirect to login for page requests, 401 for API
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await jwtVerify(token, JWT_SECRET_KEY);
    return NextResponse.next();
  } catch {
    // Invalid/expired token
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: [
    // Match all routes except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
