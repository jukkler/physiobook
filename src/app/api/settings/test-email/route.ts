import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { sendTestEmail } from "@/lib/email";

export const POST = withApiAuth(async (req) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  let body: { to: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  if (!body.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to)) {
    return Response.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
  }

  const result = await sendTestEmail(body.to);

  if (result.ok) {
    return Response.json({ ok: true });
  }

  return Response.json({ error: result.error }, { status: 500 });
});
