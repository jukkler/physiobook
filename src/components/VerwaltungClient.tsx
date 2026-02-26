"use client";

import { useState, useEffect } from "react";

export default function VerwaltungClient() {
  const todayBerlin = () => {
    const now = new Date();
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
    }).format(now);
  };

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

    // ISO week number
    const temp = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()));
    temp.setUTCDate(temp.getUTCDate() + 4 - (temp.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

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

      <div className="grid gap-4 sm:grid-cols-3">
        {/* Week */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Wochenarchiv
          </h3>
          <p className="text-lg font-medium text-gray-900 mb-4">
            {weekInfo.label}
          </p>
          <button
            onClick={() => handleDownload("week")}
            disabled={downloading === "week"}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {downloading === "week" ? "Wird erstellt..." : "PDF herunterladen"}
          </button>
        </div>

        {/* Month */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Monatsarchiv
          </h3>
          <p className="text-lg font-medium text-gray-900 mb-4">
            {monthInfo.label}
          </p>
          <button
            onClick={() => handleDownload("month")}
            disabled={downloading === "month"}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {downloading === "month" ? "Wird erstellt..." : "PDF herunterladen"}
          </button>
        </div>

        {/* Year */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Jahresarchiv
          </h3>
          <p className="text-lg font-medium text-gray-900 mb-4">
            {yearInfo.label}
          </p>
          <button
            onClick={() => handleDownload("year")}
            disabled={downloading === "year"}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {downloading === "year" ? "Wird erstellt..." : "PDF herunterladen"}
          </button>
        </div>
      </div>

      {/* Email / SMTP Settings */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          E-Mail-Einstellungen
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Postausgangsserver (SMTP) f&uuml;r den Versand von Benachrichtigungen bei neuen Terminanfragen.
        </p>
        {smtpLoaded ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP-Server</label>
                <input
                  type="text"
                  value={smtpSettings.smtpHost}
                  onChange={(e) => updateSmtp("smtpHost", e.target.value)}
                  placeholder="smtp.beispiel.de"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                <input
                  type="number"
                  value={smtpSettings.smtpPort}
                  onChange={(e) => updateSmtp("smtpPort", e.target.value)}
                  placeholder="587"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Benutzername</label>
                <input
                  type="text"
                  value={smtpSettings.smtpUser}
                  onChange={(e) => updateSmtp("smtpUser", e.target.value)}
                  placeholder="user@beispiel.de"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
                <input
                  type="password"
                  value={smtpSettings.smtpPass}
                  onChange={(e) => updateSmtp("smtpPass", e.target.value)}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Absenderadresse</label>
                <input
                  type="email"
                  value={smtpSettings.smtpFrom}
                  onChange={(e) => updateSmtp("smtpFrom", e.target.value)}
                  placeholder="noreply@beispiel.de"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Benachrichtigungs-E-Mail</label>
                <input
                  type="email"
                  value={smtpSettings.adminNotifyEmail}
                  onChange={(e) => updateSmtp("adminNotifyEmail", e.target.value)}
                  placeholder="praxis@beispiel.de"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSmtpSave}
                disabled={smtpSaving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {smtpSaving ? "Speichern..." : "Speichern"}
              </button>
              {smtpMessage && (
                <span className={`text-sm ${smtpMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                  {smtpMessage.text}
                </span>
              )}
            </div>

            <div className="border-t border-gray-200 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Test-E-Mail versenden</label>
              <div className="flex items-start gap-3">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="empfaenger@beispiel.de"
                  className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleTestEmail}
                  disabled={testSending || !testEmail}
                  className="px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {testSending ? "Senden..." : "Senden"}
                </button>
              </div>
              {testMessage && (
                <p className={`mt-2 text-sm ${testMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                  {testMessage.text}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-400">Laden...</div>
        )}
      </div>

      {/* Reminder Notifications */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Termin-Erinnerungen
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Patienten erhalten 24 Stunden vor ihrem Termin eine Erinnerung per E-Mail.
        </p>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setReminderEnabled((prev) => (prev === "true" ? "false" : "true"))}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                reminderEnabled === "true" ? "bg-blue-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  reminderEnabled === "true" ? "translate-x-5" : ""
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">
              {reminderEnabled === "true" ? "Aktiviert" : "Deaktiviert"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleReminderSave}
              disabled={reminderSaving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {reminderSaving ? "Speichern..." : "Speichern"}
            </button>
            {reminderMessage && (
              <span className={`text-sm ${reminderMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {reminderMessage.text}
              </span>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4">
            <button
              onClick={loadEmailList}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              {emailListOpen ? "E-Mail-Adressen ausblenden" : "Vorhandene E-Mail-Adressen anzeigen"}
            </button>
            {emailListOpen && (
              <div className="mt-3">
                {emailListLoading ? (
                  <p className="text-sm text-gray-400">Laden...</p>
                ) : emailList.length === 0 ? (
                  <p className="text-sm text-gray-500">Keine E-Mail-Adressen vorhanden.</p>
                ) : (
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {emailList.map((email) => (
                      <li key={email} className="text-sm text-gray-700 py-0.5">
                        {email}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Auto-Archive Settings */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Automatischer Archiv-Versand
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Terminarchive werden automatisch per E-Mail versendet.
        </p>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoArchive((prev) => ({
                ...prev,
                autoArchiveEnabled: prev.autoArchiveEnabled === "true" ? "false" : "true",
              }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                autoArchive.autoArchiveEnabled === "true" ? "bg-blue-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  autoArchive.autoArchiveEnabled === "true" ? "translate-x-5" : ""
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">
              {autoArchive.autoArchiveEnabled === "true" ? "Aktiviert" : "Deaktiviert"}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Intervall</label>
              <select
                value={autoArchive.autoArchiveInterval}
                onChange={(e) => setAutoArchive((prev) => ({ ...prev, autoArchiveInterval: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="daily">T&auml;glich</option>
                <option value="weekly">W&ouml;chentlich</option>
                <option value="monthly">Monatlich</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Archiv-Typ</label>
              <select
                value={autoArchive.autoArchiveType}
                onChange={(e) => setAutoArchive((prev) => ({ ...prev, autoArchiveType: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="week">Wochenarchiv</option>
                <option value="month">Monatsarchiv</option>
                <option value="year">Jahresarchiv</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Empf&auml;nger</label>
              <input
                type="email"
                value={autoArchive.autoArchiveEmail}
                onChange={(e) => setAutoArchive((prev) => ({ ...prev, autoArchiveEmail: e.target.value }))}
                placeholder="archiv@beispiel.de"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weitere E-Mail (Cron-Job)</label>
              <input
                type="email"
                value={autoArchive.cronJobEmail}
                onChange={(e) => setAutoArchive((prev) => ({ ...prev, cronJobEmail: e.target.value }))}
                placeholder="cron@beispiel.de"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500">
            {autoArchive.autoArchiveInterval === "daily"
              ? "T\u00e4glich wird das ausgew\u00e4hlte Archiv versendet."
              : autoArchive.autoArchiveInterval === "weekly"
                ? "Jeden Montag wird das ausgew\u00e4hlte Archiv versendet."
                : "Am 1. des Monats wird das ausgew\u00e4hlte Archiv versendet."}
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={handleAutoArchiveSave}
              disabled={autoArchiveSaving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {autoArchiveSaving ? "Speichern..." : "Speichern"}
            </button>
            {autoArchiveMessage && (
              <span className={`text-sm ${autoArchiveMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {autoArchiveMessage.text}
              </span>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Test-Archiv versenden</label>
            <p className="text-xs text-gray-500 mb-3">
              Versendet das ausgew&auml;hlte Archiv sofort an die angegebene Empf&auml;ngeradresse.
            </p>
            <div className="flex items-start gap-3">
              <button
                onClick={handleTestArchive}
                disabled={testArchiveSending || !autoArchive.autoArchiveEmail}
                className="px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {testArchiveSending ? "Wird versendet..." : "Jetzt senden"}
              </button>
            </div>
            {testArchiveMessage && (
              <p className={`mt-2 text-sm ${testArchiveMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {testArchiveMessage.text}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
