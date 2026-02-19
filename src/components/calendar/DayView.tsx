"use client";

import { useState, useEffect, useCallback } from "react";
import { formatBerlinDate, formatBerlinTime } from "@/lib/time";
import AppointmentCard from "./AppointmentCard";

interface Appointment {
  id: string;
  patientName: string;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  status: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  seriesId?: string | null;
}

interface Blocker {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
}

interface Settings {
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
  slotDuration: string;
}

interface DayViewProps {
  date: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
  onCreateAppointment: (startTimeMs: number) => void;
  onEditAppointment: (appointment: Appointment) => void;
}

export default function DayView({
  date,
  onDateChange,
  onCreateAppointment,
  onEditAppointment,
}: DayViewProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockersList, setBlockers] = useState<Blocker[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const dayStart = new Date(date + "T00:00:00+01:00").getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    try {
      const [apptRes, blockerRes, settingsRes] = await Promise.all([
        fetch(`/api/appointments?from=${dayStart}&to=${dayEnd}`),
        fetch(`/api/blockers?from=${dayStart}&to=${dayEnd}`),
        fetch("/api/settings"),
      ]);

      if (apptRes.ok) setAppointments(await apptRes.json());
      if (blockerRes.ok) setBlockers(await blockerRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch (err) {
      console.error("Failed to load day data:", err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleConfirm(id: string) {
    const res = await fetch(`/api/requests/${id}/confirm`, { method: "POST" });
    if (res.ok) fetchData();
  }

  async function handleReject(id: string) {
    const res = await fetch(`/api/requests/${id}/reject`, { method: "POST" });
    if (res.ok) fetchData();
  }

  function navigateDay(offset: number) {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + offset);
    onDateChange(d.toISOString().split("T")[0]);
  }

  function goToday() {
    const now = new Date();
    const berlinDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
    }).format(now);
    onDateChange(berlinDate);
  }

  const morningStart = settings?.morningStart || "08:00";
  const morningEnd = settings?.morningEnd || "13:00";
  const afternoonStart = settings?.afternoonStart || "13:00";
  const afternoonEnd = settings?.afternoonEnd || "20:00";
  const slotDuration = parseInt(settings?.slotDuration || "30", 10);

  function generateSlots(start: string, end: string) {
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    const slots: { label: string; startMinutes: number }[] = [];

    let currentMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    while (currentMinutes < endMinutes) {
      const h = Math.floor(currentMinutes / 60);
      const m = currentMinutes % 60;
      slots.push({
        label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        startMinutes: currentMinutes,
      });
      currentMinutes += slotDuration;
    }

    return slots;
  }

  const morningSlots = generateSlots(morningStart, morningEnd);
  const afternoonSlots = generateSlots(afternoonStart, afternoonEnd);

  // Convert Berlin time (minutes of day) to epoch ms for this date
  function minutesToMs(minutes: number): number {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return new Date(
      `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+01:00`
    ).getTime();
  }

  // Convert epoch ms to Berlin minutes-of-day
  function msToMinutes(epochMs: number): number {
    const berlinTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(epochMs));
    const [h, m] = berlinTime.split(":").map(Number);
    return h * 60 + m;
  }

  function handleSlotClick(slotMinutes: number) {
    onCreateAppointment(minutesToMs(slotMinutes));
  }

  function renderColumn(
    title: string,
    slots: { label: string; startMinutes: number }[]
  ) {
    if (slots.length === 0) return null;

    const columnStartMin = slots[0].startMinutes;
    const columnEndMin = slots[slots.length - 1].startMinutes + slotDuration;
    const totalMinutes = columnEndMin - columnStartMin;
    const columnStartMs = minutesToMs(columnStartMin);
    const columnEndMs = minutesToMs(columnEndMin);

    // Appointments overlapping this column
    const columnAppts = appointments.filter(
      (a) => a.startTime < columnEndMs && a.endTime > columnStartMs
    );

    // Blockers overlapping this column
    const columnBlockers = blockersList.filter(
      (b) => b.startTime < columnEndMs && b.endTime > columnStartMs
    );

    return (
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-gray-500 mb-2 text-center">
          {title}
        </h3>
        <div className="relative">
          {/* Slot grid (background) */}
          {slots.map((slot) => {
            const slotMs = minutesToMs(slot.startMinutes);
            const slotEndMs = slotMs + slotDuration * 60_000;

            const hasBlocker = columnBlockers.some(
              (b) => b.startTime < slotEndMs && b.endTime > slotMs
            );
            const isOccupied =
              hasBlocker ||
              columnAppts.some(
                (a) => a.startTime < slotEndMs && a.endTime > slotMs
              );

            // Show blocker label only in the slot where it starts
            const blockerLabels = columnBlockers.filter(
              (b) => b.startTime >= slotMs && b.startTime < slotEndMs
            );

            return (
              <div
                key={slot.startMinutes}
                className={`flex border-b border-gray-100 h-12 ${
                  hasBlocker
                    ? "bg-gray-200 cursor-not-allowed"
                    : "hover:bg-blue-50 cursor-pointer"
                }`}
                onClick={() =>
                  !isOccupied && handleSlotClick(slot.startMinutes)
                }
              >
                <div className="w-14 text-xs text-gray-400 py-1 text-right pr-2 flex-shrink-0">
                  {slot.label}
                </div>
                <div className="flex-1 py-0.5 px-1">
                  {blockerLabels.map((b) => (
                    <div
                      key={b.id}
                      className="text-xs text-gray-500 italic bg-gray-300 rounded px-1 py-0.5"
                    >
                      {b.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Appointments overlaid as absolute blocks */}
          {columnAppts.map((a) => {
            const startMin = Math.max(msToMinutes(a.startTime), columnStartMin);
            const endMin = Math.min(msToMinutes(a.endTime), columnEndMin);
            const topPct = ((startMin - columnStartMin) / totalMinutes) * 100;
            const heightPct = ((endMin - startMin) / totalMinutes) * 100;

            return (
              <div
                key={a.id}
                className="absolute z-10 pointer-events-none"
                style={{
                  top: `${topPct}%`,
                  height: `${heightPct}%`,
                  left: "3.5rem",
                  right: 0,
                }}
              >
                <div className="h-full px-1 py-0.5 pointer-events-auto">
                  <AppointmentCard
                    id={a.id}
                    patientName={a.patientName}
                    startTime={a.startTime}
                    endTime={a.endTime}
                    durationMinutes={a.durationMinutes}
                    status={a.status}
                    notes={a.notes}
                    onConfirm={handleConfirm}
                    onReject={handleReject}
                    onClick={() => onEditAppointment(a)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const pendingCount = appointments.filter(
    (a) => a.status === "REQUESTED"
  ).length;

  return (
    <div>
      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateDay(-1)}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
          >
            &larr;
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
          >
            Heute
          </button>
          <button
            onClick={() => navigateDay(1)}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
          >
            &rarr;
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="px-2 py-1 text-sm border rounded"
          />
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full font-medium">
              {pendingCount} Anfrage{pendingCount > 1 ? "n" : ""}
            </span>
          )}
          <h2 className="text-lg font-semibold text-gray-800">
            {formatBerlinDate(new Date(date + "T12:00:00Z").getTime())}
          </h2>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Laden...</div>
      ) : (
        <div className="flex gap-4">
          {renderColumn("Vormittag", morningSlots)}
          <div className="w-px bg-gray-200" />
          {renderColumn("Nachmittag", afternoonSlots)}
        </div>
      )}
    </div>
  );
}
