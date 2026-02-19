import { checkCsrf } from "@/lib/csrf";
import { clearSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const csrf = checkCsrf(req);
  if (!csrf.ok) {
    return Response.json({ error: csrf.error }, { status: 403 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}
