"use client";

import { useState } from "react";
import { epochToDateInput, epochToTimeInput, dateTimeToEpoch, formatBerlinDate, formatBerlinTime } from "@/lib/time";

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
  const [showConflict, setShowConflict] = useState(false);
  const [conflictMessage, setConflictMessage] = useState("");
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const [conflictDetails, setConflictDetails] = useState<{ name: string; startTime: number; endTime: number; type: string }[]>([]);

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

      if (res.status === 409) {
        const data = await res.json();
        setConflictMessage(data.error || "Zeitkonflikt mit bestehenden Terminen.");
        setConflictDetails(data.conflictDetails || []);
        setPendingPayload(payload);
        setShowConflict(true);
        return;
      }

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

  async function handleForceSubmit() {
    if (!pendingPayload) return;
    setSaving(true);
    setShowConflict(false);
    setError("");
    try {
      const res = await fetch("/api/blockers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pendingPayload, force: true }),
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
      setPendingPayload(null);
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

      {showConflict && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold text-amber-600">Zeitkonflikt</h3>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-700">
                {conflictMessage} Trotzdem erstellen?
              </p>
              {conflictDetails.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {conflictDetails.slice(0, 10).map((c, i) => (
                    <div key={i} className={`text-xs px-2 py-1.5 rounded ${c.type === "blocker" ? "bg-gray-100 text-gray-700" : "bg-amber-50 text-amber-800"}`}>
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-1 opacity-70">
                        {formatBerlinDate(c.startTime).split(",")[0]} {formatBerlinTime(c.startTime)}–{formatBerlinTime(c.endTime)}
                      </span>
                    </div>
                  ))}
                  {conflictDetails.length > 10 && (
                    <p className="text-xs text-gray-500">+ {conflictDetails.length - 10} weitere Konflikte</p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleForceSubmit}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-md hover:bg-amber-700 disabled:opacity-50"
                >
                  {saving ? "Speichern..." : "Trotzdem erstellen"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowConflict(false); setPendingPayload(null); setConflictMessage(""); setConflictDetails([]); }}
                  className="px-4 py-2 border text-sm rounded-md hover:bg-gray-50"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
