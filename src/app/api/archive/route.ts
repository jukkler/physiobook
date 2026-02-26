import { withApiAuth } from "@/lib/auth";
import { generateArchivePdf } from "@/lib/archive";

export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const dateStr = url.searchParams.get("date");

  if (!type || !["week", "month", "year"].includes(type)) {
    return Response.json({ error: "type muss 'week', 'month' oder 'year' sein" }, { status: 400 });
  }

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return Response.json({ error: "date muss im Format YYYY-MM-DD sein" }, { status: 400 });
  }

  const { buffer, filename } = await generateArchivePdf(type as "week" | "month" | "year", dateStr);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
});
