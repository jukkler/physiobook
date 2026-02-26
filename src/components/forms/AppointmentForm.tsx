"use client";

import { useState } from "react";
import { formatBerlinTime } from "@/lib/time";

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

interface AppointmentFormProps {
  /** If provided, we're editing; otherwise creating */
  appointment?: Appointment;
  /** Pre-filled start time (epoch ms) for new appointments */
  defaultStartTime?: number;
  onSave: () => void;
  onClose: () => void;
}

export default function AppointmentForm({
  appointment,
  defaultStartTime,
  onSave,
  onClose,
}: AppointmentFormProps) {
  const isEdit = !!appointment;

  const initialStartMs = appointment?.startTime ?? defaultStartTime ?? Date.now();
  const initialDate = epochToDateInput(initialStartMs);
  const initialTime = epochToTimeInput(initialStartMs);

  const [patientName, setPatientName] = useState(appointment?.patientName ?? "");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(appointment?.durationMinutes ?? 30);
  const [contactEmail, setContactEmail] = useState(appointment?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(appointment?.contactPhone ?? "");
  const [notes, setNotes] = useState(appointment?.notes ?? "");
  const [status, setStatus] = useState(appointment?.status ?? "CONFIRMED");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"single" | "series">("single");
  const [isSeries, setIsSeries] = useState(false);
  const [seriesCount, setSeriesCount] = useState(6);

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
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const startTimeMs = dateTimeToEpoch(date, time);

      const payload: Record<string, unknown> = {
        patientName,
        startTime: startTimeMs,
        durationMinutes: duration,
        contactEmail: contactEmail || undefined,
        contactPhone: contactPhone || undefined,
        notes: notes || undefined,
        status,
      };

      if (!isEdit && isSeries) {
        const dayOfWeek = new Date(startTimeMs).getUTCDay();
        payload.series = { dayOfWeek, count: seriesCount };
      }

      const url = isEdit ? `/api/appointments/${appointment.id}` : "/api/appointments";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Speichern");
        return;
      }

      if (!isEdit && isSeries) {
        const data = await res.json();
        if (data.conflicts?.length > 0) {
          alert(`${data.created.length} von ${seriesCount} Terminen erstellt. ${data.conflicts.length} Konflikte wurden übersprungen.`);
        }
      }

      onSave();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(scope: "single" | "series") {
    setSaving(true);
    try {
      const res = await fetch(`/api/appointments/${appointment!.id}?scope=${scope}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onSave();
      } else {
        const data = await res.json();
        setError(data.error || "Fehler beim Löschen");
      }
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? "Termin bearbeiten" : "Neuer Termin"}
          </h2>
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
              Patient *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Name des Patienten"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Datum *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Uhrzeit *
              </label>
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dauer *
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={15}>15 Minuten</option>
              <option value={30}>30 Minuten</option>
              <option value={45}>45 Minuten</option>
              <option value={60}>60 Minuten</option>
            </select>
          </div>

          {!isEdit && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSeries}
                  onChange={(e) => setIsSeries(e.target.checked)}
                  className="rounded"
                />
                Serientermin (wöchentlich wiederholen)
              </label>
              {isSeries && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Anzahl Wochen
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={52}
                    value={seriesCount}
                    onChange={(e) => setSeriesCount(Math.max(2, Math.min(52, Number(e.target.value))))}
                    className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Erstellt {seriesCount} Termine im wöchentlichen Abstand
                  </p>
                </div>
              )}
            </div>
          )}

          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="CONFIRMED">Bestätigt</option>
                <option value="REQUESTED">Anfrage</option>
                <option value="CANCELLED">Abgesagt</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              E-Mail
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="patient@beispiel.de"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Telefon
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+49 ..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notizen
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 200))}
              maxLength={200}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Kürzel, z.B. KG, MT, Lymph"
            />
            <span className="text-xs text-gray-400">{notes.length}/200</span>
          </div>

          {isEdit && appointment.seriesId && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
              Dieser Termin gehört zu einer Serie.
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Speichern..." : isEdit ? "Speichern" : "Erstellen"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border text-sm rounded-md hover:bg-gray-50"
            >
              Abbrechen
            </button>
          </div>

          {isEdit && (
            <div className="border-t pt-3 mt-3">
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Termin löschen
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Wirklich löschen?</p>
                  {appointment.seriesId && (
                    <div className="flex gap-2">
                      <label className="flex items-center gap-1 text-sm">
                        <input
                          type="radio"
                          name="deleteScope"
                          checked={deleteScope === "single"}
                          onChange={() => setDeleteScope("single")}
                        />
                        Nur diesen
                      </label>
                      <label className="flex items-center gap-1 text-sm">
                        <input
                          type="radio"
                          name="deleteScope"
                          checked={deleteScope === "series"}
                          onChange={() => setDeleteScope("series")}
                        />
                        Ganze Serie
                      </label>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(appointment.seriesId ? deleteScope : "single")}
                      disabled={saving}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      Löschen
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
