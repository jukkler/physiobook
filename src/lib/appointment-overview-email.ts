import { PRAXIS } from "@/lib/constants";
import { escapeHtml } from "@/lib/html";
import { formatBerlinDate, formatBerlinTime } from "@/lib/time";

export interface AppointmentOverviewItem {
  startTime: number;
  endTime: number;
  durationMinutes: number;
  status: "CONFIRMED" | "REQUESTED";
}

export function buildAppointmentOverviewEmail(
  patientName: string,
  appointments: AppointmentOverviewItem[]
) {
  const rows = [...appointments]
    .sort((a, b) => a.startTime - b.startTime)
    .map((appointment) => {
      const status = appointment.status === "REQUESTED"
        ? '<span style="color:#92400e">Angefragt</span>'
        : "Best&auml;tigt";

      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${formatBerlinDate(appointment.startTime)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${formatBerlinTime(appointment.startTime)} &ndash; ${formatBerlinTime(appointment.endTime)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${appointment.durationMinutes} Min.</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${status}</td>
      </tr>`;
    })
    .join("");

  return {
    subject: `${PRAXIS.name} – Ihre Terminübersicht`,
    html: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"></head>
<body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827">
  <div style="max-width:680px;margin:0 auto;padding:24px">
    <div style="background:#ffffff;border-radius:8px;padding:24px">
      <h1 style="font-size:20px;margin:0 0 8px">${escapeHtml(PRAXIS.name)}</h1>
      <p style="font-size:13px;color:#6b7280;margin:0 0 24px">${escapeHtml(PRAXIS.address)} &middot; ${escapeHtml(PRAXIS.phone)}</p>
      <p>Hallo ${escapeHtml(patientName)},</p>
      <p>hier erhalten Sie eine Übersicht Ihrer kommenden Termine:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:20px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #d1d5db">Datum</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #d1d5db">Uhrzeit</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #d1d5db">Dauer</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #d1d5db">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:13px;color:#6b7280;margin-top:24px">Bei Rückfragen erreichen Sie uns unter ${escapeHtml(PRAXIS.phone)}.</p>
    </div>
  </div>
</body>
</html>`,
  };
}
