import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "physiobook_session";
const JWT_SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET!
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
  "/api/contact",
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
    const res = NextResponse.next();

    // Allow widget to be embedded in the main website iframe
    if (pathname === "/widget" || pathname.startsWith("/widget/")) {
      const widgetOrigin = process.env.WIDGET_ORIGIN || "https://therapiezentrum-ziesemer.de";
      res.headers.set(
        "Content-Security-Policy",
        `frame-ancestors 'self' ${widgetOrigin}`
      );
      // Remove X-Frame-Options if set (conflicts with frame-ancestors)
      res.headers.delete("X-Frame-Options");
    }

    return res;
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
