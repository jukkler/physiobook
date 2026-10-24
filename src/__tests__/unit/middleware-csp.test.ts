import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";

let middleware: typeof import("@/middleware").middleware;

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-for-middleware-tests-0123456789";
  process.env.WIDGET_ORIGIN = "https://therapiezentrum-ziesemer.de";
  ({ middleware } = await import("@/middleware"));
});

const request = (path: string) => new NextRequest(new URL(path, "https://kalender.example.test"));
const cspOf = async (path: string) =>
  (await middleware(request(path))).headers.get("Content-Security-Policy") ?? "";

describe("middleware: Content-Security-Policy", () => {
  it("forbids framing and sets the baseline directives on public pages", async () => {
    const csp = await cspOf("/login");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it("sets the baseline CSP on the login redirect for protected pages", async () => {
    const res = await middleware(request("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("sets the baseline CSP on 401 responses of protected API routes", async () => {
    const res = await middleware(request("/api/patients"));
    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("lets only the main website frame the widget", async () => {
    const csp = await cspOf("/widget");
    expect(csp).toContain("frame-ancestors 'self' https://therapiezentrum-ziesemer.de");
    expect(csp).not.toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});
