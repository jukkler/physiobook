"use client";

import { useState } from "react";

interface BlockerFormProps {
  defaultStartTime?: number;
  onSave: () => void;
  onClose: () => void;
}

export default function BlockerForm({
  defaultStartTime,
  onSave,
  onClose,
}: BlockerFormProps) {
  const initialMs = defaultStartTime ?? Date.now();

  function epochToDateInput(ms: number): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  }

  function epochToTimeInput(ms: number): string {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  }

  function dateTimeToEpoch(dateStr: string, timeStr: string): number {
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hours, minutes] = timeStr.split(":").map(Number);
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
    const berlinFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = berlinFormatter.formatToParts(utcGuess);
    const berlinHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const berlinMinute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    let offsetMinutes = (berlinHour * 60 + berlinMinute) - (hours * 60 + minutes);
    if (offsetMinutes > 720) offsetMinutes -= 1440;
    if (offsetMinutes < -720) offsetMinutes += 1440;
    return Date.UTC(year, month - 1, day, hours, minutes, 0) - offsetMinutes * 60_000;
  }

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(epochToDateInput(initialMs));
  const [startTime, setStartTime] = useState(epochToTimeInput(initialMs));
  const [endDate, setEndDate] = useState(epochToDateInput(initialMs));
  const [endTime, setEndTime] = useState(
    epochToTimeInput(initialMs + 60 * 60_000) // +1 hour default
  );
  const [allDay, setAllDay] = useState(false);
  const [isSeries, setIsSeries] = useState(false);
  const [seriesCount, setSeriesCount] = useState(5);
  const [seriesInterval, setSeriesInterval] = useState(7);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const startMs = dateTimeToEpoch(startDate, allDay ? "00:00" : startTime);
      const endMs = dateTimeToEpoch(endDate, allDay ? "23:59" : endTime);

      if (endMs <= startMs) {
        setError("Ende muss nach dem Start liegen");
        setSaving(false);
        return;
      }

      const payload: Record<string, unknown> = {
        title,
        startTime: startMs,
        endTime: endMs,
      };

      if (isSeries) {
        payload.series = {
          count: seriesCount,
          intervalDays: seriesInterval,
        };
      }

      const res = await fetch("/api/blockers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Erstellen");
        return;
      }

      onSave();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Neuer Blocker</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titel *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="z.B. Mittagspause, Fortbildung"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              <span className="font-medium text-gray-700">Ganztägig</span>
            </label>
          </div>

          <div className={`grid ${allDay ? "grid-cols-1" : "grid-cols-2"} gap-3`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start-Datum
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {!allDay && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start-Uhrzeit
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div className={`grid ${allDay ? "grid-cols-1" : "grid-cols-2"} gap-3`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ende-Datum
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {!allDay && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ende-Uhrzeit
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isSeries}
                onChange={(e) => setIsSeries(e.target.checked)}
              />
              <span className="font-medium text-gray-700">Wiederholen</span>
            </label>
          </div>

          {isSeries && (
            <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded p-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Anzahl
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={seriesCount}
                  onChange={(e) => setSeriesCount(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Intervall (Tage)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={seriesInterval}
                  onChange={(e) => setSeriesInterval(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-md hover:bg-gray-900 disabled:opacity-50"
            >
              {saving ? "Speichern..." : "Blocker erstellen"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border text-sm rounded-md hover:bg-gray-50"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
