"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Patient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export default function PatientenClient() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // New patient
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newSaving, setNewSaving] = useState(false);

  // CSV import
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadPatients = useCallback(async (q?: string) => {
    try {
      const url = q ? `/api/patients?q=${encodeURIComponent(q)}` : "/api/patients";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPatients(search || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, loadPatients]);

  function startEdit(p: Patient) {
    setEditId(p.id);
    setEditName(p.name);
    setEditEmail(p.email || "");
    setEditPhone(p.phone || "");
  }

  function cancelEdit() {
    setEditId(null);
  }

  async function saveEdit() {
    if (!editId || !editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/patients/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, email: editEmail, phone: editPhone }),
      });
      if (res.ok) {
        setEditId(null);
        loadPatients(search || undefined);
        setMessage({ type: "success", text: "Gespeichert" });
      } else {
        const data = await res.json().catch(() => null);
        setMessage({ type: "error", text: data?.error || "Fehler" });
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler" });
    } finally {
      setEditSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function deletePatient(id: string, name: string) {
    if (!confirm(`Patient "${name}" wirklich l\u00f6schen?`)) return;
    try {
      const res = await fetch(`/api/patients/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadPatients(search || undefined);
        setMessage({ type: "success", text: "Gel\u00f6scht" });
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler" });
    } finally {
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function handleCsvImport(file: File) {
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/patients/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Import fehlgeschlagen" });
      } else {
        const parts: string[] = [];
        if (data.imported > 0) parts.push(`${data.imported} importiert`);
        if (data.skipped > 0) parts.push(`${data.skipped} übersprungen (Duplikate)`);
        if (data.errors?.length > 0) parts.push(`${data.errors.length} Fehler`);
        setMessage({ type: data.imported > 0 ? "success" : "error", text: parts.join(", ") || "Keine Daten importiert" });
        loadPatients(search || undefined);
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setMessage(null), 5000);
    }
  }

  async function createPatient() {
    if (!newName.trim()) return;
    setNewSaving(true);
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, email: newEmail || undefined, phone: newPhone || undefined }),
      });
      if (res.ok) {
        setShowNew(false);
        setNewName("");
        setNewEmail("");
        setNewPhone("");
        loadPatients(search || undefined);
        setMessage({ type: "success", text: "Patient angelegt" });
      } else {
        const data = await res.json().catch(() => null);
        setMessage({ type: "error", text: data?.error || "Fehler" });
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler" });
    } finally {
      setNewSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Patienten suchen..."
          className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleCsvImport(file);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="px-4 py-2 border text-sm font-medium rounded-md hover:bg-gray-50 transition-colors whitespace-nowrap disabled:opacity-50"
        >
          {importing ? "Importiere..." : "CSV Import"}
        </button>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          Neuer Patient
        </button>
      </div>

      {message && (
        <div className={`text-sm px-3 py-2 rounded ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {showNew && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Neuer Patient</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name *"
              autoFocus
              className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="E-Mail"
              className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Telefon"
              className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={createPatient}
              disabled={newSaving || !newName.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {newSaving ? "Anlegen..." : "Anlegen"}
            </button>
            <button
              onClick={() => { setShowNew(false); setNewName(""); setNewEmail(""); setNewPhone(""); }}
              className="px-4 py-2 border text-sm rounded-md hover:bg-gray-50"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4 text-sm text-gray-400">Laden...</div>
        ) : patients.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            {search ? "Keine Patienten gefunden." : "Noch keine Patienten vorhanden."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">E-Mail</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Telefon</th>
                <th className="px-4 py-2 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {patients.map((p) =>
                editId === p.id ? (
                  <tr key={p.id} className="bg-blue-50">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={saveEdit}
                          disabled={editSaving}
                          className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          OK
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-2 py-1 border text-xs rounded hover:bg-gray-50"
                        >
                          X
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-900">{p.name}</td>
                    <td className="px-4 py-2 text-gray-600">{p.email || "\u2014"}</td>
                    <td className="px-4 py-2 text-gray-600">{p.phone || "\u2014"}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEdit(p)}
                          className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => deletePatient(p.id, p.name)}
                          className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                        >
                          L&ouml;schen
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
