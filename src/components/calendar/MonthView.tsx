"use client";

import { useState, useEffect, useCallback } from "react";
import { formatBerlinTime, addDays, berlinDayStartMs, getMonthName } from "@/lib/time";
import type { Appointment, Blocker } from "@/lib/db/schema";

interface MonthViewProps {
  date: string; // any date in the month
  onDateChange: (date: string) => void;
  onDayClick: (date: string) => void;
  onBlockerClick: (blocker: Blocker) => void;
}

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MAX_VISIBLE = 3;

const STATUS_DOT: Record<string, string> = {
  CONFIRMED: "bg-blue-400",
  REQUESTED: "bg-amber-400",
  CANCELLED: "bg-gray-400",
  EXPIRED: "bg-gray-300",
};

/**
 * Build the 6×7 grid of dates for a given month.
 * Starts on Monday, fills previous/next month days.
 */
function buildCalendarGrid(dateStr: string): string[] {
  const [year, month] = dateStr.split("-").map(Number);
  // First day of month
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  // Day of week: 0=Sun → we want Mon=0
  let dow = first.getUTCDay(); // 0=Sun
  dow = dow === 0 ? 6 : dow - 1; // Mon=0, ..., Sun=6

  // Start from the Monday before (or on) the 1st
  const gridStart = addDays(`${year}-${String(month).padStart(2, "0")}-01`, -dow);

  // Always 6 rows × 7 = 42 days
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export default function MonthView({
  date,
  onDateChange,
  onDayClick,
  onBlockerClick,
}: MonthViewProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockersList, setBlockers] = useState<Blocker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [year, month] = date.split("-").map(Number);
  const gridDates = buildCalendarGrid(date);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const rangeStart = berlinDayStartMs(gridDates[0]);
    const rangeEnd = berlinDayStartMs(gridDates[41]) + 24 * 60 * 60 * 1000;

    try {
      const [apptRes, blockerRes] = await Promise.all([
        fetch(`/api/appointments?from=${rangeStart}&to=${rangeEnd}`, { signal }),
        fetch(`/api/blockers?from=${rangeStart}&to=${rangeEnd}`, { signal }),
      ]);

      if (apptRes.ok) setAppointments(await apptRes.json());
      if (blockerRes.ok) setBlockers(await blockerRes.json());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to load month data:", err);
      setError("Daten konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  function navigateMonth(offset: number) {
    const d = new Date(Date.UTC(year, month - 1 + offset, 1, 12));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    onDateChange(`${y}-${m}-01`);
  }

  function goToday() {
    const now = new Date();
    const berlinDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
    }).format(now);
    onDateChange(berlinDate);
  }

  function getAppointmentsForDay(dayDate: string): Appointment[] {
    const dayStart = berlinDayStartMs(dayDate);
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return appointments
      .filter((a) => a.startTime < dayEnd && a.endTime > dayStart)
      .sort((a, b) => a.startTime - b.startTime);
  }

  function getBlockersForDay(dayDate: string): Blocker[] {
    const dayStart = berlinDayStartMs(dayDate);
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return blockersList.filter(
      (b) => b.startTime < dayEnd && b.endTime > dayStart
    );
  }

  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
  }).format(new Date());

  const currentMonth = month; // 1-based

  return (
    <div className="flex flex-col h-full">
      {/* Navigation */}
      <div className="flex items-center justify-between pb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateMonth(-1)}
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
            onClick={() => navigateMonth(1)}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
          >
            &rarr;
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-800">
          {getMonthName(date)}
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
          <div className="flex flex-col h-full">
            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 flex-shrink-0">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="bg-gray-50 text-center py-1.5 text-sm font-medium text-gray-600"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Calendar grid: 6 rows */}
            <div className="grid grid-cols-7 grid-rows-6 gap-px bg-gray-200 flex-1">
              {gridDates.map((dayDate) => {
                const [, , dayNum] = dayDate.split("-").map(Number);
                const dayMonth = parseInt(dayDate.split("-")[1], 10);
                const isCurrentMonth = dayMonth === currentMonth;
                const isToday = dayDate === todayStr;
                const isWeekend = (() => {
                  const d = new Date(dayDate + "T12:00:00Z");
                  const dow = d.getUTCDay();
                  return dow === 0 || dow === 6;
                })();

                const dayAppts = getAppointmentsForDay(dayDate);
                const dayBlockers = getBlockersForDay(dayDate);
                const extraCount = Math.max(0, dayAppts.length - MAX_VISIBLE);

                return (
                  <div
                    key={dayDate}
                    className={`flex flex-col p-1 cursor-pointer hover:bg-blue-50/50 transition-colors overflow-hidden ${
                      !isCurrentMonth
                        ? "bg-gray-50 text-gray-400"
                        : isWeekend
                          ? "bg-gray-50/70 text-gray-700"
                          : "bg-white text-gray-700"
                    } ${isToday ? "ring-2 ring-blue-400 ring-inset" : ""}`}
                    onClick={() => onDayClick(dayDate)}
                  >
                    {/* Day number */}
                    <div className={`text-sm font-medium mb-0.5 ${
                      isToday
                        ? "bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center"
                        : ""
                    }`}>
                      {dayNum}
                    </div>

                    {/* Blockers */}
                    {dayBlockers.map((b) => (
                      <div
                        key={b.id}
                        className="text-[10px] leading-tight truncate bg-gray-300 text-gray-600 rounded px-1 mb-0.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBlockerClick(b);
                        }}
                      >
                        {b.title}
                      </div>
                    ))}

                    {/* Appointments */}
                    {dayAppts.slice(0, MAX_VISIBLE).map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-1 text-[10px] leading-tight truncate mb-0.5"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[a.status] || STATUS_DOT.CONFIRMED}`} />
                        <span className="text-gray-500">{formatBerlinTime(a.startTime)}</span>
                        <span className="truncate font-medium">{a.patientName}</span>
                      </div>
                    ))}

                    {extraCount > 0 && (
                      <div className="text-[10px] text-gray-400 mt-auto">
                        +{extraCount} weitere
                      </div>
                    )}
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
