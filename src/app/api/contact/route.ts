import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { escapeHtml } from "@/lib/html";
import { isValidEmail } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { corsHeaders, handlePreflight } from "@/lib/cors";

// OPTIONS /api/contact (CORS preflight)
export async function OPTIONS(req: Request) {
  return handlePreflight(req) ?? new Response(null, { status: 204 });
}

// POST /api/contact - Public contact form endpoint
export async function POST(req: Request) {
  const cors = corsHeaders(req);

  // Rate limit: 5 per IP per hour
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`contact:${ip}`, 5, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." },
      { status: 429, headers: cors }
    );
  }

  let body: {
    vorname?: string;
    nachname?: string;
    email?: string;
    telefon?: string;
    betreff?: string;
    nachricht?: string;
    website?: string; // honeypot
  };

  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Ungültige Anfrage" },
      { status: 400, headers: cors }
    );
  }

  // Honeypot check — bots fill hidden fields
  if (body.website) {
    // Silently accept to not reveal the trap
    return Response.json(
      { message: "Ihre Nachricht wurde gesendet." },
      { status: 201, headers: cors }
    );
  }

  const { vorname, nachname, email, telefon, betreff, nachricht } = body;

  // Required fields
  if (!vorname || !nachname || !email || !telefon || !betreff || !nachricht) {
    return Response.json(
      { error: "Alle Pflichtfelder müssen ausgefüllt werden." },
      { status: 400, headers: cors }
    );
  }

  // Length limits
  if (vorname.length > 100 || nachname.length > 100) {
    return Response.json(
      { error: "Name darf max. 100 Zeichen lang sein." },
      { status: 400, headers: cors }
    );
  }
  if (telefon.length > 30) {
    return Response.json(
      { error: "Telefonnummer darf max. 30 Zeichen lang sein." },
      { status: 400, headers: cors }
    );
  }
  if (email.length > 100) {
    return Response.json(
      { error: "E-Mail darf max. 100 Zeichen lang sein." },
      { status: 400, headers: cors }
    );
  }
  if (betreff.length > 200) {
    return Response.json(
      { error: "Betreff darf max. 200 Zeichen lang sein." },
      { status: 400, headers: cors }
    );
  }
  if (nachricht.length > 5000) {
    return Response.json(
      { error: "Nachricht darf max. 5000 Zeichen lang sein." },
      { status: 400, headers: cors }
    );
  }

  if (!isValidEmail(email)) {
    return Response.json(
      { error: "Ungültige E-Mail-Adresse." },
      { status: 400, headers: cors }
    );
  }

  // Queue email to admin
  const db = getDb();
  const adminEmailSetting = db
    .prepare("SELECT value FROM settings WHERE key = 'adminNotifyEmail'")
    .get() as { value: string } | undefined;

  if (adminEmailSetting) {
    const fullName = `${vorname} ${nachname}`.replace(/[\r\n]/g, "");
    db.prepare(
      `INSERT INTO email_outbox (id, to_address, subject, html, status, attempts, created_at)
       VALUES (?, ?, ?, ?, 'PENDING', 0, ?)`
    ).run(
      uuidv4(),
      adminEmailSetting.value,
      `Kontaktformular: ${betreff.replace(/[\r\n]/g, "").slice(0, 100)}`,
      `<h2>Neue Kontaktanfrage über die Website</h2>
       <p><strong>Name:</strong> ${escapeHtml(fullName)}</p>
       <p><strong>E-Mail:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
       <p><strong>Telefon:</strong> ${escapeHtml(telefon)}</p>
       <p><strong>Betreff:</strong> ${escapeHtml(betreff)}</p>
       <hr />
       <p>${escapeHtml(nachricht).replace(/\n/g, "<br />")}</p>`,
      Date.now()
    );
  }

  return Response.json(
    { message: "Ihre Nachricht wurde gesendet." },
    { status: 201, headers: cors }
  );
}
