"use client";

import { useState } from "react";

interface Patient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface Props {
  patients: Patient[];
  onClose: () => void;
  onMerged: () => void;
}

export default function PatientenMergeDialog({ patients, onClose, onMerged }: Props) {
  const [selectedName, setSelectedName] = useState(patients[0].name);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(
    patients.find((p) => p.email)?.email ?? null
  );
  const [selectedPhone, setSelectedPhone] = useState<string | null>(
    patients.find((p) => p.phone)?.phone ?? null
  );
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState("");

  // Collect unique values for each field
  const names = [...new Set(patients.map((p) => p.name))];
  const emails = [...new Set(patients.map((p) => p.email).filter(Boolean))] as string[];
  const phones = [...new Set(patients.map((p) => p.phone).filter(Boolean))] as string[];

  async function handleMerge() {
    setMerging(true);
    setError("");

    // Target = first patient, sources = rest
    const targetId = patients[0].id;
    const sourceIds = patients.slice(1).map((p) => p.id);

    try {
      const res = await fetch("/api/patients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId,
          sourceIds,
          name: selectedName,
          email: selectedEmail,
          phone: selectedPhone,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Fehler beim Zusammenlegen");
        return;
      }

      onMerged();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Patienten zusammenlegen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>
          )}

          <p className="text-sm text-gray-600">
            {patients.length} Patienten werden zu einem zusammengelegt. Wähle die Daten, die übernommen werden sollen:
          </p>

          {/* Name selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            {names.length > 1 ? (
              <div className="space-y-1">
                {names.map((n) => (
                  <label key={n} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="merge-name"
                      checked={selectedName === n}
                      onChange={() => setSelectedName(n)}
                    />
                    <span className="text-gray-900">{n}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-900 px-1">{names[0]}</div>
            )}
          </div>

          {/* Email selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
            {emails.length > 1 ? (
              <div className="space-y-1">
                {emails.map((e) => (
                  <label key={e} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="merge-email"
                      checked={selectedEmail === e}
                      onChange={() => setSelectedEmail(e)}
                    />
                    <span className="text-gray-900">{e}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="merge-email"
                    checked={selectedEmail === null}
                    onChange={() => setSelectedEmail(null)}
                  />
                  <span className="text-gray-400">Keine</span>
                </label>
              </div>
            ) : emails.length === 1 ? (
              <div className="text-sm text-gray-900 px-1">{emails[0]}</div>
            ) : (
              <div className="text-sm text-gray-400 px-1">Keine E-Mail vorhanden</div>
            )}
          </div>

          {/* Phone selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
            {phones.length > 1 ? (
              <div className="space-y-1">
                {phones.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="merge-phone"
                      checked={selectedPhone === p}
                      onChange={() => setSelectedPhone(p)}
                    />
                    <span className="text-gray-900">{p}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="merge-phone"
                    checked={selectedPhone === null}
                    onChange={() => setSelectedPhone(null)}
                  />
                  <span className="text-gray-400">Keine</span>
                </label>
              </div>
            ) : phones.length === 1 ? (
              <div className="text-sm text-gray-900 px-1">{phones[0]}</div>
            ) : (
              <div className="text-sm text-gray-400 px-1">Kein Telefon vorhanden</div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleMerge}
              disabled={merging}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {merging ? "Zusammenlegen..." : "Zusammenlegen"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border text-sm rounded-md hover:bg-gray-50"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
