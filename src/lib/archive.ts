import { getDb } from "@/lib/db";
import {
  getWeekMonday,
  addDays,
  berlinDayStartMs,
  formatBerlinTime,
  formatBerlinDate,
  formatBerlinDateTime,
  epochToDateInput,
} from "@/lib/time";
import PDFDocument from "pdfkit";

interface AppointmentRow {
  id: string;
  patient_name: string;
  start_time: number;
  end_time: number;
  duration_minutes: number;
  status: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
}

interface BlockerRow {
  id: string;
  title: string;
  start_time: number;
  end_time: number;
}

type CalendarEntry = {
  type: "appointment";
  startTime: number;
  data: AppointmentRow;
} | {
  type: "blocker";
  startTime: number;
  data: BlockerRow;
};

export function computeRange(type: string, dateStr: string): { from: number; to: number; title: string; filename: string } {
  if (type === "week") {
    const monday = getWeekMonday(dateStr);
    const sunday = addDays(monday, 6);
    const from = berlinDayStartMs(monday);
    const to = berlinDayStartMs(addDays(monday, 7));

    const d = new Date(monday + "T12:00:00Z");
    const temp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    temp.setUTCDate(temp.getUTCDate() + 4 - (temp.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

    const fmtStart = formatBerlinDate(from);
    const fmtEnd = formatBerlinDate(berlinDayStartMs(sunday));

    return {
      from, to,
      title: `Terminarchiv \u2014 KW ${weekNum} (${fmtStart} \u2013 ${fmtEnd})`,
      filename: `Terminarchiv_KW${weekNum}_${monday}.pdf`,
    };
  }

  if (type === "month") {
    const [year, month] = dateStr.split("-").map(Number);
    const from = berlinDayStartMs(`${year}-${String(month).padStart(2, "0")}-01`);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const to = berlinDayStartMs(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`);

    const monthName = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" })
      .format(new Date(year, month - 1, 15));

    return {
      from, to,
      title: `Terminarchiv \u2014 ${monthName}`,
      filename: `Terminarchiv_${year}-${String(month).padStart(2, "0")}.pdf`,
    };
  }

  const year = parseInt(dateStr.split("-")[0], 10);
  const from = berlinDayStartMs(`${year}-01-01`);
  const to = berlinDayStartMs(`${year + 1}-01-01`);

  return {
    from, to,
    title: `Terminarchiv \u2014 ${year}`,
    filename: `Terminarchiv_${year}.pdf`,
  };
}

function statusLabel(status: string): string {
  switch (status) {
    case "CONFIRMED": return "Best\u00e4tigt";
    case "REQUESTED": return "Anfrage";
    case "CANCELLED": return "Storniert";
    case "EXPIRED": return "Abgelaufen";
    default: return status;
  }
}

// Table drawing helpers
const COL_WIDTHS = [70, 150, 45, 60, 120, 100];
const HEADERS = ["Uhrzeit", "Patient", "Dauer", "Status", "Kontakt", "Notizen"];
const ROW_HEIGHT = 18;
const HEADER_COLOR = "#1c4f9e";
const STRIPE_COLOR = "#f3f4f6";
const FONT_SIZE = 8;
const HEADER_FONT_SIZE = 8;

function drawTableHeader(doc: PDFKit.PDFDocument, y: number, startX: number): number {
  const totalWidth = COL_WIDTHS.reduce((a, b) => a + b, 0);
  doc.rect(startX, y, totalWidth, ROW_HEIGHT).fill(HEADER_COLOR);

  doc.font("Helvetica-Bold").fontSize(HEADER_FONT_SIZE).fillColor("#ffffff");
  let x = startX;
  for (let i = 0; i < HEADERS.length; i++) {
    doc.text(HEADERS[i], x + 3, y + 4, { width: COL_WIDTHS[i] - 6, height: ROW_HEIGHT });
    x += COL_WIDTHS[i];
  }
  doc.fillColor("#000000");
  return y + ROW_HEIGHT;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  y: number,
  startX: number,
  cells: string[],
  isStripe: boolean,
  isBlocker: boolean
): number {
  const totalWidth = COL_WIDTHS.reduce((a, b) => a + b, 0);

  if (isStripe) {
    doc.rect(startX, y, totalWidth, ROW_HEIGHT).fill(STRIPE_COLOR);
  }

  doc.font(isBlocker ? "Helvetica-Oblique" : "Helvetica")
    .fontSize(FONT_SIZE)
    .fillColor(isBlocker ? "#666666" : "#000000");

  let x = startX;
  for (let i = 0; i < cells.length; i++) {
    doc.text(cells[i], x + 3, y + 4, { width: COL_WIDTHS[i] - 6, height: ROW_HEIGHT, ellipsis: true });
    x += COL_WIDTHS[i];
  }
  doc.fillColor("#000000");
  return y + ROW_HEIGHT;
}

export async function generateArchivePdf(
  type: "week" | "month" | "year",
  dateStr: string
): Promise<{ buffer: Buffer; filename: string; title: string }> {
  const { from, to, title, filename } = computeRange(type, dateStr);

  const db = getDb();

  const appointments = db
    .prepare(
      `SELECT id, patient_name, start_time, end_time, duration_minutes, status, contact_email, contact_phone, notes
       FROM appointments
       WHERE start_time < ? AND end_time >= ?
       ORDER BY start_time`
    )
    .all(to, from) as AppointmentRow[];

  const blockerRows = db
    .prepare(
      `SELECT id, title, start_time, end_time
       FROM blockers
       WHERE start_time < ? AND end_time >= ?
       ORDER BY start_time`
    )
    .all(to, from) as BlockerRow[];

  const entries: CalendarEntry[] = [
    ...appointments.map((a) => ({ type: "appointment" as const, startTime: a.start_time, data: a })),
    ...blockerRows.map((b) => ({ type: "blocker" as const, startTime: b.start_time, data: b })),
  ];

  const dayMap = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const dayKey = epochToDateInput(entry.startTime);
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
    dayMap.get(dayKey)!.push(entry);
  }
  const sortedDays = [...dayMap.keys()].sort();

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    bufferPages: true,
    margins: { top: 30, bottom: 40, left: 30, right: 30 },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pageWidth = 841.89 - 60;
  const startX = 30;
  const pageBottom = 595.28 - 40;

  doc.font("Helvetica-Bold").fontSize(14).fillColor(HEADER_COLOR).text(title, startX, 30);
  doc.fillColor("#000000");

  let y = 55;

  if (sortedDays.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor("#6b7280")
      .text("Keine Termine in diesem Zeitraum.", startX, y);
  } else {
    for (const dayKey of sortedDays) {
      const dayEntries = dayMap.get(dayKey)!;
      dayEntries.sort((a, b) => a.startTime - b.startTime);

      const minNeeded = 20 + ROW_HEIGHT + ROW_HEIGHT;
      if (y + minNeeded > pageBottom) {
        doc.addPage();
        y = 30;
      }

      const dayLabel = formatBerlinDate(berlinDayStartMs(dayKey) + 12 * 3600_000);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#374151").text(dayLabel, startX, y);
      y += 16;

      y = drawTableHeader(doc, y, startX);

      for (let i = 0; i < dayEntries.length; i++) {
        if (y + ROW_HEIGHT > pageBottom) {
          doc.addPage();
          y = 30;
          y = drawTableHeader(doc, y, startX);
        }

        const entry = dayEntries[i];
        const isStripe = i % 2 === 1;

        if (entry.type === "appointment") {
          const a = entry.data as AppointmentRow;
          const timeRange = `${formatBerlinTime(a.start_time)}\u2013${formatBerlinTime(a.end_time)}`;
          const contact = [a.contact_email, a.contact_phone].filter(Boolean).join(", ");
          y = drawTableRow(doc, y, startX, [
            timeRange, a.patient_name, `${a.duration_minutes} min`,
            statusLabel(a.status), contact || "\u2013", a.notes || "\u2013",
          ], isStripe, false);
        } else {
          const b = entry.data as BlockerRow;
          const timeRange = `${formatBerlinTime(b.start_time)}\u2013${formatBerlinTime(b.end_time)}`;
          y = drawTableRow(doc, y, startX, [
            timeRange, b.title, "\u2013", "Blocker", "\u2013", "\u2013",
          ], isStripe, true);
        }
      }

      y += 8;
    }
  }

  const generatedAt = formatBerlinDateTime(Date.now());
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    const footerY = pageBottom + 10;
    doc.font("Helvetica").fontSize(7).fillColor("#9ca3af");
    doc.text(`Erstellt am ${generatedAt}`, startX, footerY, { lineBreak: false });
    const pageLabel = `Seite ${i + 1} / ${pages.count}`;
    const labelWidth = doc.widthOfString(pageLabel);
    doc.text(pageLabel, startX + pageWidth - labelWidth, footerY, { lineBreak: false });
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => {
      resolve({ buffer: Buffer.concat(chunks), filename, title });
    });
  });
}
