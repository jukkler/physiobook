"use client";

import { useState, useEffect, useRef } from "react";
import { todayBerlin, getIsoWeekNumber } from "@/lib/time";
import PdfImportPanel from "@/components/verwaltung/PdfImportPanel";
import ArchiveDownloadPanel from "@/components/verwaltung/ArchiveDownloadPanel";
import SmtpSettingsPanel from "@/components/verwaltung/SmtpSettingsPanel";
import ReminderSettingsPanel from "@/components/verwaltung/ReminderSettingsPanel";
import AutoArchivePanel from "@/components/verwaltung/AutoArchivePanel";

export default function VerwaltungClient() {
  const [date, setDate] = useState(todayBerlin);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Email / SMTP settings
  const [smtpSettings, setSmtpSettings] = useState({
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    adminNotifyEmail: "",
  });
  const [smtpLoaded, setSmtpLoaded] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpMessage, setSmtpMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testMessage, setTestMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Auto-archive settings
  const [autoArchive, setAutoArchive] = useState({
    autoArchiveEnabled: "false",
    autoArchiveInterval: "weekly",
    autoArchiveType: "week",
    autoArchiveEmail: "",
    cronJobEmail: "",
  });
  const [autoArchiveSaving, setAutoArchiveSaving] = useState(false);
  const [autoArchiveMessage, setAutoArchiveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testArchiveSending, setTestArchiveSending] = useState(false);
  const [testArchiveMessage, setTestArchiveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Reminder settings
  const [reminderEnabled, setReminderEnabled] = useState("false");
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderMessage, setReminderMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [emailListOpen, setEmailListOpen] = useState(false);
  const [emailList, setEmailList] = useState<string[]>([]);
  const [emailListLoading, setEmailListLoading] = useState(false);

  // Calendar reset
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleReset() {
    setResetting(true);
    setResetMessage(null);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setResetMessage({
          type: "success",
          text: `Gelöscht: ${data.deleted.appointments} Termine, ${data.deleted.blockers} Blocker, ${data.deleted.patients} Patienten, ${data.deleted.emails} E-Mails`,
        });
      } else {
        setResetMessage({ type: "error", text: "Fehler beim Zurücksetzen" });
      }
    } catch {
      setResetMessage({ type: "error", text: "Netzwerkfehler" });
    } finally {
      setResetting(false);
      setResetConfirm(false);
    }
  }

  // PDF import
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [pdfDebug, setPdfDebug] = useState<string | null>(null);

  async function handlePdfImport(e: React.ChangeEvent<HTMLInputElement>, debug = false) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfImporting(true);
    setPdfMessage(null);
    setPdfDebug(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (debug) formData.append("debug", "1");
      const res = await fetch("/api/appointments/import", { method: "POST", body: formData });
      const data = await res.json();
      if (debug) {
        setPdfDebug(data.rawText || JSON.stringify(data));
        return;
      }
      if (!res.ok) {
        setPdfMessage({ type: "error", text: data.error || "Import fehlgeschlagen" });
      } else {
        const msg = `${data.imported} Termine importiert.` +
          (data.errors?.length ? ` ${data.errors.length} Fehler.` : "");
        setPdfMessage({ type: "success", text: msg });
      }
    } catch {
      setPdfMessage({ type: "error", text: "Netzwerkfehler beim Import" });
    } finally {
      setPdfImporting(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setSmtpSettings((prev) => ({
            smtpHost: data.smtpHost || prev.smtpHost,
            smtpPort: data.smtpPort || prev.smtpPort,
            smtpUser: data.smtpUser || prev.smtpUser,
            smtpPass: data.smtpPass || prev.smtpPass,
            smtpFrom: data.smtpFrom || prev.smtpFrom,
            adminNotifyEmail: data.adminNotifyEmail || prev.adminNotifyEmail,
          }));
          setAutoArchive((prev) => ({
            autoArchiveEnabled: data.autoArchiveEnabled || prev.autoArchiveEnabled,
            autoArchiveInterval: data.autoArchiveInterval || prev.autoArchiveInterval,
            autoArchiveType: data.autoArchiveType || prev.autoArchiveType,
            autoArchiveEmail: data.autoArchiveEmail || prev.autoArchiveEmail,
            cronJobEmail: data.cronJobEmail || prev.cronJobEmail,
          }));
          if (data.reminderNotificationsEnabled) {
            setReminderEnabled(data.reminderNotificationsEnabled);
          }
        }
        setSmtpLoaded(true);
      })
      .catch(() => setSmtpLoaded(true));
  }, []);

  function updateSmtp(key: string, value: string) {
    setSmtpSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSmtpSave() {
    setSmtpSaving(true);
    setSmtpMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smtpSettings),
      });
      if (res.ok) {
        setSmtpMessage({ type: "success", text: "Gespeichert" });
      } else {
        const data = await res.json().catch(() => null);
        setSmtpMessage({ type: "error", text: data?.error || "Fehler beim Speichern" });
      }
    } catch {
      setSmtpMessage({ type: "error", text: "Netzwerkfehler" });
    } finally {
      setSmtpSaving(false);
      setTimeout(() => setSmtpMessage(null), 3000);
    }
  }

  async function handleTestEmail() {
    if (!testEmail) return;
    setTestSending(true);
    setTestMessage(null);
    try {
      const res = await fetch("/api/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      });
      if (res.ok) {
        setTestMessage({ type: "success", text: "Test-E-Mail versendet" });
      } else {
        const data = await res.json().catch(() => null);
        setTestMessage({ type: "error", text: data?.error || "Versand fehlgeschlagen" });
      }
    } catch {
      setTestMessage({ type: "error", text: "Netzwerkfehler" });
    } finally {
      setTestSending(false);
      setTimeout(() => setTestMessage(null), 5000);
    }
  }

  async function handleAutoArchiveSave() {
    setAutoArchiveSaving(true);
    setAutoArchiveMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(autoArchive),
      });
      if (res.ok) {
        setAutoArchiveMessage({ type: "success", text: "Gespeichert" });
      } else {
        const data = await res.json().catch(() => null);
        setAutoArchiveMessage({ type: "error", text: data?.error || "Fehler beim Speichern" });
      }
    } catch {
      setAutoArchiveMessage({ type: "error", text: "Netzwerkfehler" });
    } finally {
      setAutoArchiveSaving(false);
      setTimeout(() => setAutoArchiveMessage(null), 3000);
    }
  }

  async function handleTestArchive() {
    if (!autoArchive.autoArchiveEmail) return;
    setTestArchiveSending(true);
    setTestArchiveMessage(null);
    try {
      const res = await fetch("/api/settings/test-archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: autoArchive.autoArchiveEmail, type: autoArchive.autoArchiveType }),
      });
      if (res.ok) {
        setTestArchiveMessage({ type: "success", text: "Test-Archiv versendet" });
      } else {
        const data = await res.json().catch(() => null);
        setTestArchiveMessage({ type: "error", text: data?.error || "Versand fehlgeschlagen" });
      }
    } catch {
      setTestArchiveMessage({ type: "error", text: "Netzwerkfehler" });
    } finally {
      setTestArchiveSending(false);
      setTimeout(() => setTestArchiveMessage(null), 5000);
    }
  }

  async function handleReminderSave() {
    setReminderSaving(true);
    setReminderMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderNotificationsEnabled: reminderEnabled }),
      });
      if (res.ok) {
        setReminderMessage({ type: "success", text: "Gespeichert" });
      } else {
        const data = await res.json().catch(() => null);
        setReminderMessage({ type: "error", text: data?.error || "Fehler beim Speichern" });
      }
    } catch {
      setReminderMessage({ type: "error", text: "Netzwerkfehler" });
    } finally {
      setReminderSaving(false);
      setTimeout(() => setReminderMessage(null), 3000);
    }
  }

  async function loadEmailList() {
    if (emailListOpen) {
      setEmailListOpen(false);
      return;
    }
    setEmailListOpen(true);
    setEmailListLoading(true);
    try {
      const res = await fetch("/api/appointments/emails");
      if (res.ok) {
        const data = await res.json();
        setEmailList(data.emails || []);
      }
    } catch {
      // silent
    } finally {
      setEmailListLoading(false);
    }
  }

  // Compute week info
  function getWeekInfo(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00Z");
    const dayOfWeek = d.getUTCDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diff);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const weekNum = getIsoWeekNumber(dateStr);

    const fmt = (d: Date) =>
      new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(d);

    return { weekNum, label: `KW ${weekNum} (${fmt(monday)} \u2013 ${fmt(sunday)})` };
  }

  // Compute month info
  function getMonthInfo(dateStr: string) {
    const [year, month] = dateStr.split("-").map(Number);
    const label = new Intl.DateTimeFormat("de-DE", {
      month: "long",
      year: "numeric",
    }).format(new Date(year, month - 1, 15));
    return { label };
  }

  // Compute year info
  function getYearInfo(dateStr: string) {
    const year = dateStr.split("-")[0];
    return { label: year };
  }

  async function handleDownload(type: "week" | "month" | "year") {
    setDownloading(type);
    try {
      window.open(`/api/archive?type=${type}&date=${date}`, "_blank");
    } finally {
      // Small delay so the button shows loading briefly
      setTimeout(() => setDownloading(null), 1000);
    }
  }

  function handleAutoArchiveChange(updates: Record<string, string>) {
    setAutoArchive((prev) => ({ ...prev, ...updates }));
  }

  const weekInfo = getWeekInfo(date);
  const monthInfo = getMonthInfo(date);
  const yearInfo = getYearInfo(date);

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Datum auswählen
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <PdfImportPanel
        pdfInputRef={pdfInputRef}
        pdfImporting={pdfImporting}
        pdfMessage={pdfMessage}
        pdfDebug={pdfDebug}
        onImport={(e) => handlePdfImport(e)}
        onUploadClick={() => pdfInputRef.current?.click()}
      />

      <ArchiveDownloadPanel
        weekLabel={weekInfo.label}
        monthLabel={monthInfo.label}
        yearLabel={yearInfo.label}
        downloading={downloading}
        onDownload={handleDownload}
      />

      <SmtpSettingsPanel
        smtpSettings={smtpSettings}
        smtpLoaded={smtpLoaded}
        smtpSaving={smtpSaving}
        smtpMessage={smtpMessage}
        testEmail={testEmail}
        testSending={testSending}
        testMessage={testMessage}
        onSmtpChange={updateSmtp}
        onSmtpSave={handleSmtpSave}
        onTestEmailChange={setTestEmail}
        onTestEmailSend={handleTestEmail}
      />

      <ReminderSettingsPanel
        reminderEnabled={reminderEnabled}
        reminderSaving={reminderSaving}
        reminderMessage={reminderMessage}
        emailListOpen={emailListOpen}
        emailList={emailList}
        emailListLoading={emailListLoading}
        onToggle={() => setReminderEnabled((prev) => (prev === "true" ? "false" : "true"))}
        onSave={handleReminderSave}
        onToggleEmailList={loadEmailList}
      />

      {/* Kalender zurücksetzen */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-red-800 mb-2">Kalender zurücksetzen</h3>
        <p className="text-xs text-red-600 mb-3">
          Löscht alle Termine, Blocker, Patienten und E-Mails. Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
        {resetMessage && (
          <div className={`text-sm mb-3 p-2 rounded ${resetMessage.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {resetMessage.text}
          </div>
        )}
        {!resetConfirm ? (
          <button
            onClick={() => setResetConfirm(true)}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Kalender zurücksetzen
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={resetting}
              className="px-4 py-2 text-sm bg-red-800 text-white rounded-md hover:bg-red-900 disabled:opacity-50"
            >
              {resetting ? "Lösche..." : "Wirklich alles löschen?"}
            </button>
            <button
              onClick={() => setResetConfirm(false)}
              className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>

      <AutoArchivePanel
        autoArchive={autoArchive}
        autoArchiveSaving={autoArchiveSaving}
        autoArchiveMessage={autoArchiveMessage}
        testArchiveSending={testArchiveSending}
        testArchiveMessage={testArchiveMessage}
        onAutoArchiveChange={handleAutoArchiveChange}
        onSave={handleAutoArchiveSave}
        onTestArchive={handleTestArchive}
      />
    </div>
  );
}
