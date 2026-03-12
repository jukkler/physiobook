"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { epochToDateInput, epochToTimeInput, dateTimeToEpoch, formatBerlinDate, formatBerlinTime } from "@/lib/time";
import { PRAXIS } from "@/lib/constants";
import type { Appointment } from "@/lib/db/schema";

interface PatientSuggestion {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
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
  const [editScope, setEditScope] = useState<"single" | "series">("single");
  const [showConflict, setShowConflict] = useState(false);
  const [conflictMessage, setConflictMessage] = useState("");
  const [conflictDetails, setConflictDetails] = useState<{ name: string; startTime: number; endTime: number; type: string }[]>([]);
  const [pendingPayload, setPendingPayload] = useState<{ url: string; method: string; body: Record<string, unknown> } | null>(null);
  const [isSeries, setIsSeries] = useState(false);
  const [seriesCount, setSeriesCount] = useState(6);
  const [seriesInterval, setSeriesInterval] = useState(1);
  const [isPermanent, setIsPermanent] = useState(false);

  // Autocomplete
  const [suggestions, setSuggestions] = useState<PatientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.patients);
        setShowSuggestions(data.patients.length > 0);
      }
    } catch {
      // silent
    }
  }, []);

  function handleNameChange(value: string) {
    setPatientName(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  }

  function selectSuggestion(p: PatientSuggestion) {
    setPatientName(p.name);
    if (p.email) setContactEmail(p.email);
    if (p.phone) setContactPhone(p.phone);
    setShowSuggestions(false);
    setSuggestions([]);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    if (showSuggestions) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSuggestions]);

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
        const count = isPermanent ? 52 : seriesCount;
        payload.series = { dayOfWeek, count, intervalWeeks: seriesInterval };
      }

      const scopeParam = isEdit && appointment.seriesId && editScope === "series" ? "?scope=series" : "";
      const url = isEdit ? `/api/appointments/${appointment.id}${scopeParam}` : "/api/appointments";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        // Conflict — ask user whether to force or cancel
        const data = await res.json();
        setConflictMessage(data.error || "Dieser Zeitraum ist bereits belegt.");
        setConflictDetails(data.conflictDetails || []);
        setPendingPayload({ url, method, body: payload });
        setShowConflict(true);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Speichern");
        return;
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

  async function handleForceSubmit() {
    if (!pendingPayload) return;
    setSaving(true);
    setShowConflict(false);
    setError("");
    try {
      const res = await fetch(pendingPayload.url, {
        method: pendingPayload.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pendingPayload.body, force: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Speichern");
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

  async function handlePrint() {
    const name = isEdit ? appointment!.patientName : patientName;
    if (!name) return;

    try {
      const res = await fetch(`/api/appointments/patient?name=${encodeURIComponent(name)}`);
      if (!res.ok) return;
      const appts: { startTime: number; endTime: number; durationMinutes: number }[] = await res.json();

      if (appts.length === 0) {
        setError("Keine zukünftigen Termine gefunden.");
        return;
      }

      const rows = appts.map((a) =>
        `<tr>
          <td style="padding:4px 12px 4px 0">${formatBerlinDate(a.startTime)}</td>
          <td style="padding:4px 12px 4px 0">${formatBerlinTime(a.startTime)} – ${formatBerlinTime(a.endTime)}</td>
          <td style="padding:4px 0">${a.durationMinutes} min</td>
        </tr>`
      ).join("");

      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Termine ${name}</title>
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
<h2>Terminübersicht für ${name}</h2>
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
    } catch {
      setError("Fehler beim Laden der Termine");
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

          <div className="relative" ref={suggestionsRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Patient *
            </label>
            <input
              type="text"
              required
              autoFocus
              autoComplete="off"
              value={patientName}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Name des Patienten"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {suggestions.map((p) => (
                  <li
                    key={p.id}
                    onClick={() => selectSuggestion(p)}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer"
                  >
                    <div className="text-sm font-medium text-gray-900">{p.name}</div>
                    {p.email && (
                      <div className="text-xs text-gray-500">{p.email}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
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
              <option value={90}>90 Minuten</option>
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
                Serientermin (wiederholen)
              </label>
              {isSeries && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Intervall
                    </label>
                    <select
                      value={seriesInterval}
                      onChange={(e) => setSeriesInterval(Number(e.target.value))}
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={1}>Wöchentlich</option>
                      <option value={2}>Alle 2 Wochen</option>
                      <option value={3}>Alle 3 Wochen</option>
                      <option value={4}>Alle 4 Wochen</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPermanent}
                      onChange={(e) => setIsPermanent(e.target.checked)}
                      className="rounded"
                    />
                    Dauerpatient
                  </label>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Anzahl Termine
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={52}
                      value={isPermanent ? 52 : seriesCount}
                      onChange={(e) => setSeriesCount(Math.max(2, Math.min(52, Number(e.target.value))))}
                      disabled={isPermanent}
                      className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isPermanent ? "bg-gray-100 text-gray-400 cursor-not-allowed" : ""}`}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {isPermanent
                      ? `Erstellt 52 Termine ${seriesInterval === 1 ? "im wöchentlichen Abstand" : `alle ${seriesInterval} Wochen`} (1 Jahr)`
                      : `Erstellt ${seriesCount} Termine ${seriesInterval === 1 ? "im wöchentlichen Abstand" : `alle ${seriesInterval} Wochen`}`}
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
                onChange={(e) => setStatus(e.target.value as Appointment["status"])}
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
            <div className="bg-gray-50 rounded p-3 space-y-2">
              <p className="text-xs text-gray-500">Dieser Termin gehört zu einer Serie.</p>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="editScope"
                    checked={editScope === "single"}
                    onChange={() => setEditScope("single")}
                  />
                  <span className="text-gray-700">Nur diesen Termin ändern</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="editScope"
                    checked={editScope === "series"}
                    onChange={() => setEditScope("series")}
                  />
                  <span className="text-gray-700">Alle Termine der Serie ändern</span>
                </label>
              </div>
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
            {isEdit && (
              !showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={saving}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  Löschen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const scope = appointment?.seriesId ? editScope : "single";
                    handleDelete(scope);
                  }}
                  disabled={saving}
                  className="px-4 py-2 bg-red-800 text-white text-sm font-medium rounded-md hover:bg-red-900 disabled:opacity-50"
                >
                  {saving ? "Löschen..." : "Wirklich löschen?"}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => { onClose(); setShowDeleteConfirm(false); }}
              className="px-4 py-2 border text-sm rounded-md hover:bg-gray-50"
            >
              Abbrechen
            </button>
          </div>

          {isEdit && (
            <div className="pt-1">
              <button
                type="button"
                onClick={handlePrint}
                className="w-full px-4 py-2 text-sm text-gray-600 border border-dashed rounded-md hover:bg-gray-50 hover:text-gray-900"
              >
                Termine drucken
              </button>
            </div>
          )}
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
                {conflictMessage || "Dieser Zeitraum ist bereits belegt."} Trotzdem speichern?
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
                  {saving ? "Speichern..." : "Trotzdem speichern"}
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
