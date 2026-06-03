"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { epochToDateInput, epochToTimeInput, dateTimeToEpoch, formatBerlinDate, formatBerlinTime } from "@/lib/time";
import { PRAXIS } from "@/lib/constants";
import { isValidEmail } from "@/lib/validation";
import type { Appointment, AppointmentSeriesScope, AppointmentWithContact } from "@/lib/db/schema";
import SeriesFields from "@/components/forms/SeriesFields";
import SeriesScopeDialog from "@/components/forms/SeriesScopeDialog";
import SeriesSummary from "@/components/forms/SeriesSummary";

interface PatientSuggestion {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface AppointmentFormProps {
  /** If provided, we're editing; otherwise creating */
  appointment?: AppointmentWithContact;
  /** Pre-filled start time (epoch ms) for new appointments */
  defaultStartTime?: number;
  onSave: () => void;
  onClose: () => void;
  onShowPatient?: (patient: { id: string; name: string; email: string | null; phone: string | null }) => void;
}

const EMAIL_SUBJECT_MAX_LENGTH = 120;
const EMAIL_BODY_MAX_LENGTH = 2000;

export default function AppointmentForm({
  appointment,
  defaultStartTime,
  onSave,
  onClose,
  onShowPatient,
}: AppointmentFormProps) {
  const isEdit = !!appointment;

  const initialStartMs = appointment?.startTime ?? defaultStartTime ?? Date.now();
  const initialDate = epochToDateInput(initialStartMs);
  const initialTime = epochToTimeInput(initialStartMs);

  const [patientName, setPatientName] = useState(appointment?.patientName ?? "");
  const [patientId, setPatientId] = useState<string | null>(
    appointment?.patientId ?? null
  );
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(appointment?.durationMinutes ?? 30);
  const [contactEmail, setContactEmail] = useState(appointment?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(appointment?.contactPhone ?? "");
  const [notes, setNotes] = useState(appointment?.notes ?? "");
  const [status, setStatus] = useState(appointment?.status ?? "CONFIRMED");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingScopeAction, setPendingScopeAction] = useState<"save" | "delete" | null>(null);
  const [showConflict, setShowConflict] = useState(false);
  const [conflictMessage, setConflictMessage] = useState("");
  const [conflictDetails, setConflictDetails] = useState<{ name: string; startTime: number; endTime: number; type: string }[]>([]);
  const [pendingPayload, setPendingPayload] = useState<{ url: string; method: string; body: Record<string, unknown> } | null>(null);
  const [isSeries, setIsSeries] = useState(false);
  const [seriesCount, setSeriesCount] = useState(6);
  const [seriesInterval, setSeriesInterval] = useState(1);
  const [isPermanent, setIsPermanent] = useState(false);
  const canSendEmail = isEdit && !!contactEmail && isValidEmail(contactEmail);

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
    setPatientId(null); // reset — new patient will be created on backend
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  }

  function selectSuggestion(p: PatientSuggestion) {
    setPatientName(p.name);
    setPatientId(p.id);
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

  function buildPayload() {
    const startTimeMs = dateTimeToEpoch(date, time);
    const payload: Record<string, unknown> = {
      patientName,
      patientId: patientId || undefined,
      startTime: startTimeMs,
      durationMinutes: duration,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      notes: notes || undefined,
      status,
    };

    if (!isEdit && isSeries) {
      payload.series = {
        count: isPermanent ? 52 : seriesCount,
        intervalWeeks: seriesInterval,
      };
    }

    return payload;
  }

  function buildDefaultEmailSubject() {
    return `Ihr Termin am ${formatBerlinDate(dateTimeToEpoch(date, time))}`;
  }

  function buildDefaultEmailBody() {
    const startTimeMs = dateTimeToEpoch(date, time);
    const endTimeMs = startTimeMs + duration * 60_000;
    const notesLine = notes.trim() ? `\nHinweis: ${notes.trim()}` : "";

    return `Hallo ${patientName},

hiermit senden wir Ihnen Ihre Termininformation:

${formatBerlinDate(startTimeMs)}
${formatBerlinTime(startTimeMs)} - ${formatBerlinTime(endTimeMs)} Uhr
${duration} Minuten${notesLine}

Falls Sie den Termin nicht wahrnehmen können, melden Sie sich bitte rechtzeitig in der Praxis.

Viele Grüße
${PRAXIS.name}`;
  }

  function openEmailComposer() {
    setEmailMessage(null);
    setError("");
    setEmailSubject((current) => current || buildDefaultEmailSubject());
    setEmailBody((current) => current || buildDefaultEmailBody());
    setShowEmailComposer(true);
  }

  async function submitWithScope(scope: AppointmentSeriesScope | null) {
    setError("");
    setSaving(true);
    try {
      const payload = buildPayload();
      const scopeParam = isEdit && appointment?.seriesId && scope ? `?scope=${scope}` : "";
      const url = isEdit ? `/api/appointments/${appointment!.id}${scopeParam}` : "/api/appointments";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEdit && appointment?.seriesId) {
      setPendingScopeAction("save");
      return;
    }

    await submitWithScope(null);
  }

  async function handleDelete(scope: AppointmentSeriesScope) {
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

  async function handleSendAppointmentEmail() {
    if (!appointment) return;

    const subject = emailSubject.trim();
    const message = emailBody.trim();
    if (!subject || !message) {
      setEmailMessage({
        type: "error",
        text: "Bitte Betreff und Nachricht ausfüllen.",
      });
      return;
    }

    setEmailSending(true);
    setEmailMessage(null);
    setError("");

    try {
      const res = await fetch(`/api/appointments/${appointment.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message }),
      });
      const data = await res.json().catch(() => ({} as { error?: string; to?: string }));

      if (!res.ok) {
        setEmailMessage({
          type: "error",
          text: data.error || "E-Mail konnte nicht gesendet werden",
        });
        return;
      }

      setEmailMessage({
        type: "success",
        text: `E-Mail wurde an ${data.to} gesendet.`,
      });
      setShowEmailComposer(false);
    } catch {
      setEmailMessage({
        type: "error",
        text: "Netzwerkfehler beim Senden der E-Mail",
      });
    } finally {
      setEmailSending(false);
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

          {emailMessage && (
            <div
              className={`text-sm border rounded p-2 ${
                emailMessage.type === "success"
                  ? "text-green-700 bg-green-50 border-green-200"
                  : "text-red-700 bg-red-50 border-red-200"
              }`}
            >
              {emailMessage.text}
            </div>
          )}

          {isEdit && appointment.seriesSummary && (
            <SeriesSummary summary={appointment.seriesSummary} />
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
            <SeriesFields
              enabled={isSeries}
              onEnabledChange={setIsSeries}
              intervalWeeks={seriesInterval}
              onIntervalWeeksChange={setSeriesInterval}
              count={seriesCount}
              onCountChange={setSeriesCount}
              permanent={isPermanent}
              onPermanentChange={setIsPermanent}
              startTime={dateTimeToEpoch(date, time)}
              durationMinutes={duration}
            />
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

          <div className="grid grid-cols-3 gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
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
                    if (appointment?.seriesId) {
                      setPendingScopeAction("delete");
                    } else {
                      handleDelete("single");
                    }
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
              className="px-4 py-2 border border-gray-400 bg-white text-gray-800 text-sm font-medium rounded-md hover:bg-gray-100 hover:border-gray-500 disabled:opacity-50"
            >
              Abbrechen
            </button>
          </div>

          {isEdit && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              {onShowPatient && patientId && (
                <button
                  type="button"
                  onClick={() => {
                    onShowPatient({
                      id: patientId,
                      name: patientName,
                      email: contactEmail || null,
                      phone: contactPhone || null,
                    });
                    onClose();
                  }}
                  className="px-4 py-2 text-sm text-gray-600 border border-dashed rounded-md hover:bg-gray-50 hover:text-gray-900"
                >
                  Alle Termine
                </button>
              )}
              <button
                type="button"
                onClick={openEmailComposer}
                disabled={!canSendEmail}
                title={!contactEmail ? "Keine E-Mail-Adresse hinterlegt" : !isValidEmail(contactEmail) ? "Keine gültige E-Mail-Adresse hinterlegt" : "Eigene E-Mail an Patienten schreiben"}
                className="px-4 py-2 text-sm text-gray-700 border border-dashed border-gray-400 rounded-md hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                E-Mail schreiben
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="px-4 py-2 text-sm text-gray-600 border border-dashed rounded-md hover:bg-gray-50 hover:text-gray-900"
              >
                Termine drucken
              </button>
            </div>
          )}

          {isEdit && showEmailComposer && (
            <div className="rounded-md border border-blue-200 bg-blue-50/70 p-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">
                  Betreff
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  maxLength={EMAIL_SUBJECT_MAX_LENGTH}
                  onChange={(e) => setEmailSubject(e.target.value.slice(0, EMAIL_SUBJECT_MAX_LENGTH))}
                  className="w-full px-3 py-2 border border-blue-200 bg-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Betreff der E-Mail"
                />
                <div className="text-xs text-gray-500 mt-1">
                  {emailSubject.length}/{EMAIL_SUBJECT_MAX_LENGTH}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">
                  Nachricht
                </label>
                <textarea
                  value={emailBody}
                  maxLength={EMAIL_BODY_MAX_LENGTH}
                  onChange={(e) => setEmailBody(e.target.value.slice(0, EMAIL_BODY_MAX_LENGTH))}
                  rows={8}
                  className="w-full px-3 py-2 border border-blue-200 bg-white rounded-md text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  placeholder="Nachricht an den Patienten"
                />
                <div className="text-xs text-gray-500 mt-1">
                  {emailBody.length}/{EMAIL_BODY_MAX_LENGTH}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendAppointmentEmail}
                  disabled={emailSending || !canSendEmail || !emailSubject.trim() || !emailBody.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {emailSending ? "Senden..." : "E-Mail senden"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmailComposer(false)}
                  disabled={emailSending}
                  className="px-4 py-2 border border-gray-400 bg-white text-gray-800 text-sm font-medium rounded-md hover:bg-gray-100 disabled:opacity-50"
                >
                  Schließen
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {pendingScopeAction && (
        <SeriesScopeDialog
          mode={pendingScopeAction}
          saving={saving}
          onCancel={() => {
            setPendingScopeAction(null);
            setShowDeleteConfirm(false);
          }}
          onChoose={(scope) => {
            const action = pendingScopeAction;
            setPendingScopeAction(null);
            if (action === "delete") {
              handleDelete(scope);
            } else {
              submitWithScope(scope);
            }
          }}
        />
      )}

      {showConflict && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold text-amber-600">Zeitkonflikt</h3>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-700">
                {conflictMessage || "Ein oder mehrere Termine überschneiden sich."} Du kannst abbrechen oder trotzdem speichern.
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
                    <p className="text-xs text-gray-500">+ {conflictDetails.length - 10} weitere Konflikte in dieser Serie</p>
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
