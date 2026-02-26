"use client";

import { useState, useEffect, useCallback } from "react";
import { formatBerlinDate } from "@/lib/time";
import type { Appointment, Blocker, Settings } from "@/types/models";
import AppointmentCard from "./AppointmentCard";

interface DayViewProps {
  date: string; // YYYY-MM-DD
  columnMode: "split" | "single";
  onDateChange: (date: string) => void;
  onCreateAppointment: (startTimeMs: number) => void;
  onEditAppointment: (appointment: Appointment) => void;
  onBlockerClick: (blocker: Blocker) => void;
}

export default function DayView({
  date,
  columnMode,
  onDateChange,
  onCreateAppointment,
  onEditAppointment,
  onBlockerClick,
}: DayViewProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockersList, setBlockers] = useState<Blocker[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    const dayStart = new Date(date + "T00:00:00+01:00").getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    try {
      const [apptRes, blockerRes, settingsRes] = await Promise.all([
        fetch(`/api/appointments?from=${dayStart}&to=${dayEnd}`, { signal }),
        fetch(`/api/blockers?from=${dayStart}&to=${dayEnd}`, { signal }),
        fetch("/api/settings", { signal }),
      ]);

      if (apptRes.ok) setAppointments(await apptRes.json());
      if (blockerRes.ok) setBlockers(await blockerRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to load day data:", err);
      setError("Daten konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
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
  const allSlots = generateSlots(morningStart, afternoonEnd);

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

  const maxSlotCount = columnMode === "single"
    ? allSlots.length
    : Math.max(morningSlots.length, afternoonSlots.length);

  // Percentage height per slot relative to container
  const slotHeightPct = 100 / maxSlotCount;

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
      <div className="flex-1 flex flex-col">
        <h3 className="text-sm font-semibold text-gray-500 mb-2 text-center flex-shrink-0">
          {title}
        </h3>
        <div className="relative flex-1" style={{ minHeight: `${maxSlotCount * 28}px` }}>
          {/* Slot grid (background) */}
          {slots.map((slot, slotIndex) => {
            const slotMs = minutesToMs(slot.startMinutes);
            const slotEndMs = slotMs + slotDuration * 60_000;

            const slotBlocker = columnBlockers.find(
              (b) => b.startTime < slotEndMs && b.endTime > slotMs
            );
            const hasBlocker = !!slotBlocker;
            const isOccupied =
              hasBlocker ||
              columnAppts.some(
                (a) => a.startTime < slotEndMs && a.endTime > slotMs
              );

            // Show blocker label in the first slot it overlaps
            const showBlockerLabel = hasBlocker && (slotIndex === 0 || !(
              slotBlocker!.startTime < minutesToMs(slots[slotIndex - 1].startMinutes) + slotDuration * 60_000 &&
              slotBlocker!.endTime > minutesToMs(slots[slotIndex - 1].startMinutes)
            ));

            const isEvenRow = slotIndex % 2 === 1;

            return (
              <div
                key={slot.startMinutes}
                className={`flex border-b border-gray-100 ${
                  hasBlocker
                    ? "bg-gray-200 cursor-pointer hover:bg-gray-300 transition-colors"
                    : isEvenRow
                    ? "bg-blue-100/60 hover:bg-blue-100 cursor-pointer"
                    : "hover:bg-blue-50 cursor-pointer"
                }`}
                style={{ height: `${slotHeightPct}%` }}
                onClick={() => {
                  if (hasBlocker && slotBlocker) {
                    onBlockerClick(slotBlocker);
                  } else if (!isOccupied) {
                    handleSlotClick(slot.startMinutes);
                  }
                }}
              >
                <div className="w-14 text-xs text-gray-400 text-right pr-2 flex-shrink-0 flex items-center justify-end">
                  {slot.label}
                </div>
                <div className="flex-1 px-1 flex items-center">
                  {showBlockerLabel && (
                    <div className="text-xs text-gray-500 italic bg-gray-300 rounded px-1 py-0.5">
                      {slotBlocker!.title}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Appointments overlaid as absolute blocks */}
          {columnAppts.map((a) => {
            const startMin = Math.max(msToMinutes(a.startTime), columnStartMin);
            const endMin = Math.min(msToMinutes(a.endTime), columnEndMin);
            // Scale percentages: slots only occupy (slots.length / maxSlotCount) of container
            const scale = slots.length / maxSlotCount;
            const topPct = ((startMin - columnStartMin) / totalMinutes) * scale * 100;
            const heightPct = ((endMin - startMin) / totalMinutes) * scale * 100;

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
    <div className="flex flex-col h-full">
      {/* Navigation */}
      <div className="flex items-center justify-between pb-4 flex-shrink-0">
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

      <div className="flex-1 min-h-0 overflow-auto">
        {error ? (
          <div className="text-center py-12">
            <p className="text-red-600 mb-3">{error}</p>
            <button
              onClick={() => fetchData()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Erneut versuchen
            </button>
          </div>
        ) : loading ? (
          <div className="text-center py-12 text-gray-400">Laden...</div>
        ) : columnMode === "single" ? (
          <div className="flex min-h-full">
            {renderColumn("Tagesplan", allSlots)}
          </div>
        ) : (
          <div className="flex gap-4 min-h-full">
            {renderColumn("Vormittag", morningSlots)}
            <div className="w-px bg-gray-200" />
            {renderColumn("Nachmittag", afternoonSlots)}
          </div>
        )}
      </div>
    </div>
  );
}
