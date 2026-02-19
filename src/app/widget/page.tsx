"use client";

import { useState, useEffect } from "react";

interface Slot {
  startTimeMs: number;
  endTimeMs: number;
  startTimeLocal: string;
  endTimeLocal: string;
}

type Step = "date" | "slot" | "form" | "success";

export default function WidgetPage() {
  const [step, setStep] = useState<Step>("date");
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState("");

  // Form state
  const [patientName, setPatientName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [duration, setDuration] = useState(30);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Generate available dates (next 28 days)
  const availableDates: string[] = [];
  const now = new Date();
  for (let i = 1; i <= 28; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    // Avoid duplicates from timezone edge cases
    if (!availableDates.includes(dateStr)) {
      availableDates.push(dateStr);
    }
  }

  async function loadSlots(date: string) {
    setLoadingSlots(true);
    setSlotsError("");
    setSlots([]);

    try {
      const res = await fetch(`/api/slots?date=${date}`);
      if (res.status === 429) {
        setSlotsError("Zu viele Anfragen. Bitte warten Sie einen Moment.");
        return;
      }
      if (!res.ok) {
        setSlotsError("Fehler beim Laden der verfügbaren Zeiten.");
        return;
      }
      const data = await res.json();
      setSlots(data);
      if (data.length === 0) {
        setSlotsError("Keine freien Termine an diesem Tag.");
      }
    } catch {
      setSlotsError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setLoadingSlots(false);
    }
  }

  function handleDateSelect(date: string) {
    setSelectedDate(date);
    setSelectedSlot(null);
    setStep("slot");
    loadSlots(date);
  }

  function handleSlotSelect(slot: Slot) {
    setSelectedSlot(slot);
    setStep("form");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !consent) return;
    setSubmitError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotStartMs: selectedSlot.startTimeMs,
          durationMinutes: duration,
          patientName,
          contactEmail,
          contactPhone: contactPhone || undefined,
          consentGiven: true,
        }),
      });

      if (res.status === 409) {
        setSubmitError(
          "Dieser Zeitslot wurde gerade vergeben. Bitte wählen Sie einen anderen."
        );
        return;
      }

      if (res.status === 429) {
        setSubmitError("Zu viele Anfragen. Bitte warten Sie eine Stunde.");
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setSubmitError(data.error || "Fehler beim Senden der Anfrage.");
        return;
      }

      setStep("success");
    } catch {
      setSubmitError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  function formatDateDisplay(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00Z");
    return new Intl.DateTimeFormat("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  }

  function reset() {
    setStep("date");
    setSelectedDate("");
    setSelectedSlot(null);
    setPatientName("");
    setContactEmail("");
    setContactPhone("");
    setDuration(30);
    setConsent(false);
    setSubmitError("");
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Termin anfragen</h1>
      <p className="text-sm text-gray-500 mb-6">
        Wählen Sie einen freien Termin aus und senden Sie Ihre Anfrage.
      </p>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-6">
        {(["date", "slot", "form"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                step === s
                  ? "bg-blue-600 text-white"
                  : step === "success" || (["date", "slot", "form"].indexOf(step) > i)
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {i + 1}
            </div>
            {i < 2 && (
              <div className="w-8 h-px bg-gray-200" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Date selection */}
      {step === "date" && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Tag auswählen
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {availableDates.map((d) => (
              <button
                key={d}
                onClick={() => handleDateSelect(d)}
                className="px-3 py-2 text-sm border rounded-md hover:bg-blue-50 hover:border-blue-300 text-left transition-colors"
              >
                {formatDateDisplay(d)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Slot selection */}
      {step === "slot" && (
        <div>
          <button
            onClick={() => setStep("date")}
            className="text-sm text-blue-600 hover:text-blue-800 mb-3 flex items-center gap-1"
          >
            &larr; Anderes Datum
          </button>
          <h2 className="text-sm font-semibold text-gray-700 mb-1">
            Uhrzeit auswählen
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            {formatDateDisplay(selectedDate)}
          </p>

          {loadingSlots && (
            <div className="text-center py-8 text-gray-400">Laden...</div>
          )}

          {slotsError && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
              {slotsError}
            </div>
          )}

          {!loadingSlots && slots.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.startTimeMs}
                  onClick={() => handleSlotSelect(slot)}
                  className="px-3 py-2 text-sm border rounded-md hover:bg-blue-50 hover:border-blue-300 text-center transition-colors font-medium"
                >
                  {slot.startTimeLocal}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Request form */}
      {step === "form" && selectedSlot && (
        <div>
          <button
            onClick={() => setStep("slot")}
            className="text-sm text-blue-600 hover:text-blue-800 mb-3 flex items-center gap-1"
          >
            &larr; Andere Uhrzeit
          </button>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
            <p className="text-sm font-medium text-blue-900">
              {formatDateDisplay(selectedDate)} um {selectedSlot.startTimeLocal} Uhr
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {submitError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                {submitError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ihr vollständiger Name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-Mail *
              </label>
              <input
                type="email"
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ihre@email.de"
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
                Gewünschte Dauer
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={30}>30 Minuten</option>
                <option value={45}>45 Minuten</option>
                <option value={60}>60 Minuten</option>
              </select>
            </div>

            <div>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1"
                  required
                />
                <span className="text-xs text-gray-600">
                  Ich stimme der Verarbeitung meiner Daten zur Terminvereinbarung zu.{" "}
                  <a href="/datenschutz" className="text-blue-600 underline" target="_blank">
                    Datenschutzerklärung
                  </a>
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting || !consent}
              className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Wird gesendet..." : "Terminanfrage senden"}
            </button>
          </form>
        </div>
      )}

      {/* Step 4: Success */}
      {step === "success" && (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Anfrage gesendet!
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Ihre Terminanfrage wurde erfolgreich gesendet. Sie erhalten eine
            E-Mail, sobald der Termin bestätigt oder abgelehnt wird.
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
          >
            Weiteren Termin anfragen
          </button>
        </div>
      )}
    </div>
  );
}
