"use client";

import { useState, useEffect } from "react";
import { formatBerlinDate, formatBerlinTime } from "@/lib/time";
import { PRAXIS } from "@/lib/constants";

interface Patient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface PatientAppointment {
  id: string;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  status: string;
  notes: string | null;
}

interface Props {
  patient: Patient;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  CONFIRMED: { text: "Bestätigt", className: "bg-green-100 text-green-800" },
  REQUESTED: { text: "Anfrage", className: "bg-amber-100 text-amber-800" },
  CANCELLED: { text: "Abgesagt", className: "bg-gray-100 text-gray-500 line-through" },
  EXPIRED: { text: "Abgelaufen", className: "bg-gray-100 text-gray-400" },
};

export default function PatientAppointmentsDialog({ patient, onClose }: Props) {
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/appointments/by-patient?id=${patient.id}`)
      .then((res) => (res.ok ? res.json() : { appointments: [] }))
      .then((data) => setAppointments(data.appointments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patient.id]);

  const now = Date.now();
  const upcoming = appointments
    .filter((a) => a.startTime >= now && a.status !== "CANCELLED" && a.status !== "EXPIRED")
    .sort((a, b) => a.startTime - b.startTime);

  function handlePrint() {
    if (upcoming.length === 0) return;

    const rows = upcoming.map((a) =>
      `<tr>
        <td style="padding:4px 12px 4px 0">${formatBerlinDate(a.startTime)}</td>
        <td style="padding:4px 12px 4px 0">${formatBerlinTime(a.startTime)} – ${formatBerlinTime(a.endTime)}</td>
        <td style="padding:4px 0">${a.durationMinutes} min</td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Termine ${patient.name}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
  .header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
  .header img { height: 48px; width: auto; }
  .header-text h1 { margin: 0; font-size: 18px; }
  .header-text p { margin: 4px 0 0; font-size: 13px; color: #555; }
  h2 { font-size: 15px; margin: 0 0 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  tr:nth-child(even) { background: #f9f9f9; }
  th { text-align: left; padding: 4px 12px 4px 0; border-bottom: 1px solid #ccc; font-size: 12px; color: #555; }
  .footer { margin-top: 32px; font-size: 11px; color: #999; }
</style></head><body>
<div class="header">
  <img src="/logo.svg" alt="Logo" />
  <div class="header-text">
    <h1>${PRAXIS.name}</h1>
    <p>${PRAXIS.address} &middot; ${PRAXIS.phone}</p>
  </div>
</div>
<h2>Terminübersicht für ${patient.name}</h2>
<table>
  <thead><tr><th>Datum</th><th>Uhrzeit</th><th>Dauer</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">Gedruckt am ${formatBerlinDate(Date.now())}</div>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">{patient.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Patient contact info */}
          <div className="bg-gray-50 rounded-md p-3 mb-4">
            <div className="text-sm text-gray-600 space-y-1">
              {patient.email && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-12">E-Mail</span>
                  <span>{patient.email}</span>
                </div>
              )}
              {patient.phone && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-12">Telefon</span>
                  <span>{patient.phone}</span>
                </div>
              )}
              {!patient.email && !patient.phone && (
                <div className="text-gray-400">Keine Kontaktdaten</div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Termine laden...</div>
          ) : upcoming.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Keine kommenden Termine</div>
          ) : (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Kommende Termine ({upcoming.length})
              </h3>
              <div className="space-y-1">
                {upcoming.map((a) => (
                  <AppointmentRow key={a.id} appointment={a} />
                ))}
              </div>
            </div>
          )}

          {!loading && upcoming.length > 0 && (
            <button
              onClick={handlePrint}
              className="w-full mt-4 px-4 py-2 text-sm text-gray-600 border border-dashed rounded-md hover:bg-gray-50 hover:text-gray-900"
            >
              Termine drucken
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AppointmentRow({ appointment: a }: { appointment: PatientAppointment }) {
  const status = STATUS_LABEL[a.status] || STATUS_LABEL.CONFIRMED;
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-gray-50 text-sm">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900">{formatBerlinDate(a.startTime)}</div>
        <div className="text-xs text-gray-500">
          {formatBerlinTime(a.startTime)}–{formatBerlinTime(a.endTime)} · {a.durationMinutes} min
        </div>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${status.className}`}>
        {status.text}
      </span>
    </div>
  );
}
