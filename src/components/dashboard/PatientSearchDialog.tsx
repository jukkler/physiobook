"use client";

import { useState, useRef, useCallback } from "react";
import { formatBerlinDate, formatBerlinTime } from "@/lib/time";

interface Patient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface PatientAppointment {
  id: string;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  status: string;
  notes: string | null;
}

interface PatientSearchDialogProps {
  onClose: () => void;
}

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  CONFIRMED: { text: "Bestätigt", className: "bg-green-100 text-green-800" },
  REQUESTED: { text: "Anfrage", className: "bg-amber-100 text-amber-800" },
  CANCELLED: { text: "Abgesagt", className: "bg-gray-100 text-gray-500 line-through" },
  EXPIRED: { text: "Abgelaufen", className: "bg-gray-100 text-gray-400" },
};

export default function PatientSearchDialog({ onClose }: PatientSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const searchPatients = useCallback(async (q: string) => {
    if (q.length < 2) {
      setPatients([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients || []);
      }
    } catch {
      // silent
    } finally {
      setSearching(false);
    }
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelectedPatient(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPatients(value), 300);
  }

  async function selectPatient(patient: Patient) {
    setSelectedPatient(patient);
    setLoadingAppts(true);
    try {
      const res = await fetch(`/api/appointments/by-patient?id=${patient.id}`);
      if (res.ok) {
        const data = await res.json();
        setAppointments(data.appointments || []);
        // Update patient info from response (may have fresher data)
        if (data.patient) {
          setSelectedPatient(data.patient);
        }
      }
    } catch {
      // silent
    } finally {
      setLoadingAppts(false);
    }
  }

  function goBackToSearch() {
    setSelectedPatient(null);
    setAppointments([]);
  }

  const now = Date.now();
  const upcoming = appointments.filter((a) => a.startTime >= now && a.status !== "CANCELLED" && a.status !== "EXPIRED");
  const past = appointments.filter((a) => a.startTime < now || a.status === "CANCELLED" || a.status === "EXPIRED");

  // Sort upcoming ascending (nearest first), past descending (most recent first)
  upcoming.sort((a, b) => a.startTime - b.startTime);
  past.sort((a, b) => b.startTime - a.startTime);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            {selectedPatient && (
              <button
                onClick={goBackToSearch}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                &larr;
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedPatient ? selectedPatient.name : "Patientensuche"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!selectedPatient ? (
            <>
              {/* Search input */}
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Name eingeben..."
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              />

              {/* Results */}
              {searching && (
                <div className="text-center py-4 text-gray-400 text-sm">Suchen...</div>
              )}

              {!searching && query.length >= 2 && patients.length === 0 && (
                <div className="text-center py-4 text-gray-400 text-sm">
                  Keine Patienten gefunden
                </div>
              )}

              {patients.length > 0 && (
                <div className="space-y-1">
                  {patients.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectPatient(p)}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-blue-50 transition-colors"
                    >
                      <div className="text-sm font-medium text-gray-900">{p.name}</div>
                      <div className="text-xs text-gray-500">
                        {[p.email, p.phone].filter(Boolean).join(" · ") || "Keine Kontaktdaten"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Patient info */}
              <div className="bg-gray-50 rounded-md p-3 mb-4">
                <div className="text-sm text-gray-600">
                  {selectedPatient.email && <div>{selectedPatient.email}</div>}
                  {selectedPatient.phone && <div>{selectedPatient.phone}</div>}
                  {!selectedPatient.email && !selectedPatient.phone && (
                    <div className="text-gray-400">Keine Kontaktdaten</div>
                  )}
                </div>
              </div>

              {loadingAppts ? (
                <div className="text-center py-8 text-gray-400 text-sm">Termine laden...</div>
              ) : appointments.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Keine Termine vorhanden
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Upcoming */}
                  {upcoming.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Kommende ({upcoming.length})
                      </h3>
                      <div className="space-y-1">
                        {upcoming.map((a) => (
                          <AppointmentRow key={a.id} appointment={a} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Past */}
                  {past.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Vergangene ({past.length})
                      </h3>
                      <div className="space-y-1">
                        {past.map((a) => (
                          <AppointmentRow key={a.id} appointment={a} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AppointmentRow({ appointment: a }: { appointment: PatientAppointment }) {
  const status = STATUS_LABEL[a.status] || STATUS_LABEL.CONFIRMED;
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-gray-50 text-sm">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900">
          {formatBerlinDate(a.startTime)}
        </div>
        <div className="text-xs text-gray-500">
          {formatBerlinTime(a.startTime)}–{formatBerlinTime(a.endTime)} · {a.durationMinutes} min
        </div>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${status.className}`}>
        {status.text}
      </span>
    </div>
  );
}
