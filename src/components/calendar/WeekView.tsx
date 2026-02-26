"use client";

import { useState, useEffect, useCallback } from "react";
import { formatBerlinTime, getWeekMonday, addDays } from "@/lib/time";
import type { Appointment, Blocker, Settings } from "@/types/models";

interface WeekViewProps {
  date: string; // any date in the week
  onDateChange: (date: string) => void;
  onDayClick: (date: string) => void;
  onBlockerClick: (blocker: Blocker) => void;
}

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export default function WeekView({
  date,
  onDateChange,
  onDayClick,
  onBlockerClick,
}: WeekViewProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockersList, setBlockers] = useState<Blocker[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monday = getWeekMonday(date);

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const weekStart = new Date(monday + "T00:00:00+01:00").getTime();
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;

    try {
      const [apptRes, blockerRes, settingsRes] = await Promise.all([
        fetch(`/api/appointments?from=${weekStart}&to=${weekEnd}`, { signal }),
        fetch(`/api/blockers?from=${weekStart}&to=${weekEnd}`, { signal }),
        fetch("/api/settings", { signal }),
      ]);

      if (apptRes.ok) setAppointments(await apptRes.json());
      if (blockerRes.ok) setBlockers(await blockerRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to load week data:", err);
      setError("Daten konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [monday]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  function navigateWeek(offset: number) {
    const d = new Date(monday + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 7 * offset);
    onDateChange(d.toISOString().split("T")[0]);
  }

  function goToday() {
    const now = new Date();
    const berlinDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
    }).format(now);
    onDateChange(berlinDate);
  }

  function getAppointmentsForDay(dayDate: string): Appointment[] {
    const dayStart = new Date(dayDate + "T00:00:00+01:00").getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return appointments.filter(
      (a) => a.startTime < dayEnd && a.endTime > dayStart
    );
  }

  function getBlockersForDay(dayDate: string): Blocker[] {
    const dayStart = new Date(dayDate + "T00:00:00+01:00").getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return blockersList.filter(
      (b) => b.startTime < dayEnd && b.endTime > dayStart
    );
  }

  const morningStart = settings?.morningStart || "08:00";
  const afternoonEnd = settings?.afternoonEnd || "20:00";
  const [startH] = morningStart.split(":").map(Number);
  const [endH] = afternoonEnd.split(":").map(Number);
  const totalHours = endH - startH;

  // Min pixel height per hour; actual height stretches to fill screen
  const hourHeightPx = 56;

  // Generate hour labels
  const hourLabels = Array.from({ length: totalHours }, (_, i) => {
    const h = startH + i;
    return `${String(h).padStart(2, "0")}:00`;
  });

  function getSlotPosition(timeMs: number): number {
    // Convert epoch ms to Berlin time position in the day
    const berlinTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(timeMs));
    const [h, m] = berlinTime.split(":").map(Number);
    const minutesSinceStart = (h - startH) * 60 + m;
    return Math.max(0, Math.min(100, (minutesSinceStart / (totalHours * 60)) * 100));
  }

  function getSlotHeight(startMs: number, endMs: number): number {
    const durationMinutes = (endMs - startMs) / 60_000;
    return Math.max(1, (durationMinutes / (totalHours * 60)) * 100);
  }

  const STATUS_COLORS: Record<string, string> = {
    CONFIRMED: "bg-blue-200 border-blue-400",
    REQUESTED: "bg-amber-200 border-amber-400",
    CANCELLED: "bg-gray-200 border-gray-400",
    EXPIRED: "bg-gray-200 border-gray-300",
  };

  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
  }).format(new Date());

  // Format date for display header
  function formatDayHeader(dayDate: string): string {
    const d = new Date(dayDate + "T12:00:00Z");
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
    }).format(d);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Navigation */}
      <div className="flex items-center justify-between pb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWeek(-1)}
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
            onClick={() => navigateWeek(1)}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
          >
            &rarr;
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-800">
          KW{" "}
          {(() => {
            const d = new Date(monday + "T12:00:00Z");
            // ISO week number
            const temp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
            temp.setUTCDate(temp.getUTCDate() + 4 - (temp.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
            return Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
          })()}
          {" – "}
          {new Intl.DateTimeFormat("de-DE", {
            month: "long",
            year: "numeric",
          }).format(new Date(monday + "T12:00:00Z"))}
        </h2>
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
        ) : (
          <div className="flex min-h-full">
            {/* Hour labels */}
          <div className="w-12 flex-shrink-0 flex flex-col pt-8" style={{ minHeight: `${totalHours * hourHeightPx + 32}px` }}>
            {hourLabels.map((label) => (
              <div
                key={label}
                className="flex-1 text-sm text-gray-400 text-right pr-2"
                style={{ minHeight: `${hourHeightPx}px` }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex-1 grid grid-cols-7 gap-px bg-gray-200">
            {weekDates.map((dayDate, dayIdx) => {
              const dayAppts = getAppointmentsForDay(dayDate);
              const dayBlockers = getBlockersForDay(dayDate);
              const isToday = dayDate === todayStr;

              return (
                <div
                  key={dayDate}
                  className={`bg-white cursor-pointer hover:bg-blue-50/30 flex flex-col ${
                    isToday ? "ring-2 ring-blue-400 ring-inset" : ""
                  }`}
                  onClick={() => onDayClick(dayDate)}
                >
                  {/* Day header */}
                  <div
                    className={`text-center py-1.5 border-b text-base font-medium flex-shrink-0 ${
                      isToday
                        ? "bg-blue-600 text-white"
                        : "bg-gray-50 text-gray-700"
                    }`}
                  >
                    <div>{WEEKDAY_LABELS[dayIdx]}</div>
                    <div className="text-sm">{formatDayHeader(dayDate)}</div>
                  </div>

                  {/* Time grid */}
                  <div className="relative flex-1" style={{ minHeight: `${totalHours * hourHeightPx}px` }}>
                    {/* Hour lines */}
                    {hourLabels.map((_, i) => (
                      <div
                        key={i}
                        className="absolute w-full border-t border-gray-100"
                        style={{ top: `${(i / totalHours) * 100}%` }}
                      />
                    ))}

                    {/* Blockers */}
                    {dayBlockers.map((b) => {
                      // Clamp blocker to this day's visible range for multi-day blockers
                      const startDateBerlin = new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Europe/Berlin",
                      }).format(new Date(b.startTime));
                      const endDateBerlin = new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Europe/Berlin",
                      }).format(new Date(b.endTime));

                      const topPct = startDateBerlin < dayDate ? 0 : getSlotPosition(b.startTime);
                      const bottomPct = endDateBerlin > dayDate ? 100 : getSlotPosition(b.endTime);
                      const heightPct = Math.max(1, bottomPct - topPct);

                      return (
                        <div
                          key={b.id}
                          className="absolute left-0 right-0 bg-gray-300/80 border-l-2 border-gray-500 mx-0.5 flex items-center justify-center cursor-pointer hover:bg-gray-400/80 transition-colors"
                          style={{
                            top: `${topPct}%`,
                            height: `${heightPct}%`,
                            minHeight: "1.5rem",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onBlockerClick(b);
                          }}
                        >
                          <span className="text-sm text-gray-600 font-medium">
                            {b.title}
                          </span>
                        </div>
                      );
                    })}

                    {/* Appointments */}
                    {dayAppts.map((a) => (
                      <div
                        key={a.id}
                        className={`absolute left-0 right-0 border-l-2 rounded-r-sm mx-0.5 px-0.5 overflow-hidden ${
                          STATUS_COLORS[a.status] || STATUS_COLORS.CONFIRMED
                        }`}
                        style={{
                          top: `${getSlotPosition(a.startTime)}%`,
                          height: `${getSlotHeight(a.startTime, a.endTime)}%`,
                          minHeight: "0.75rem",
                        }}
                      >
                        <span className="text-xs font-medium truncate block">
                          {a.patientName}
                        </span>
                        <span className="text-[11px] opacity-70 truncate block">
                          {formatBerlinTime(a.startTime)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
