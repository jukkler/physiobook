import { withApiAuth } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { generateArchivePdf } from "@/lib/archive";
import { sendEmailWithAttachment } from "@/lib/email";

export const POST = withApiAuth(async (req) => {
  const csrf = checkCsrf(req);
  if (!csrf.ok) return Response.json({ error: csrf.error }, { status: 403 });

  let body: { to: string; type: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const { to, type } = body;

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return Response.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
  }

  if (!type || !["week", "month", "year"].includes(type)) {
    return Response.json({ error: "Ungültiger Archiv-Typ" }, { status: 400 });
  }

  // Use yesterday as reference date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(yesterday);

  const archiveLabels: Record<string, string> = {
    week: "Wochenarchiv",
    month: "Monatsarchiv",
    year: "Jahresarchiv",
  };

  const { buffer, filename, title } = await generateArchivePdf(type as "week" | "month" | "year", dateStr);

  const result = await sendEmailWithAttachment(
    to,
    title,
    `<p>Im Anhang finden Sie das ${archiveLabels[type]} (Testversand).</p>`,
    { filename, content: buffer }
  );

  if (result.ok) {
    return Response.json({ ok: true });
  } else {
    return Response.json({ error: result.error }, { status: 500 });
  }
});
