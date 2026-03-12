const WIDGET_ORIGIN = process.env.WIDGET_ORIGIN || "";

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") || "";
  if (WIDGET_ORIGIN && origin === WIDGET_ORIGIN) {
    return {
      "Access-Control-Allow-Origin": WIDGET_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };
  }
  return {};
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  return null;
}
