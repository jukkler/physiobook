"use client";

import { useEffect, useState } from "react";
import {
  EMAIL_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplateKey,
} from "@/lib/email-template-defaults";
import PlaceholderHelp from "@/components/email-settings/PlaceholderHelp";
import TemplateEditorPanel from "@/components/email-settings/TemplateEditorPanel";

type EmailTemplateSettings = Record<EmailTemplateKey, string>;

function createDefaultSettings(): EmailTemplateSettings {
  return { ...EMAIL_TEMPLATE_DEFAULTS };
}

export default function EmailSettingsClient() {
  const [settings, setSettings] = useState<EmailTemplateSettings>(createDefaultSettings);
  const [activeField, setActiveField] = useState<EmailTemplateKey>("appointmentEmailBodyTemplate");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) {
          const next = createDefaultSettings();
          for (const key of EMAIL_TEMPLATE_KEYS) {
            if (typeof data[key] === "string") next[key] = data[key];
          }
          setSettings(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage({ type: "error", text: "E-Mail-Einstellungen konnten nicht geladen werden." });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateSetting(key: EmailTemplateKey, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function insertPlaceholder(token: string) {
    setSettings((prev) => ({
      ...prev,
      [activeField]: `${prev[activeField]}${prev[activeField].endsWith(" ") || prev[activeField].endsWith("\n") ? "" : " "}${token}`,
    }));
  }

  async function saveSettings() {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Gespeichert" });
      } else {
        const data = await res.json().catch(() => null);
        setMessage({ type: "error", text: data?.error || "Fehler beim Speichern" });
      }
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler" });
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setSettings(createDefaultSettings());
    setMessage(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {message && (
          <div
            className={`text-sm border rounded-md px-3 py-2 ${
              message.type === "success"
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        <TemplateEditorPanel
          title="Terminfenster"
          description="Vorlage für manuelle E-Mails aus einem Termin."
          subjectKey="appointmentEmailSubjectTemplate"
          bodyKey="appointmentEmailBodyTemplate"
          subject={settings.appointmentEmailSubjectTemplate}
          body={settings.appointmentEmailBodyTemplate}
          onChange={updateSetting}
          onFocusField={setActiveField}
        />

        <TemplateEditorPanel
          title="Terminerinnerung"
          description="Vorlage für automatische Erinnerungen vor bestätigten Terminen."
          subjectKey="reminderEmailSubjectTemplate"
          bodyKey="reminderEmailBodyTemplate"
          subject={settings.reminderEmailSubjectTemplate}
          body={settings.reminderEmailBodyTemplate}
          onChange={updateSetting}
          onFocusField={setActiveField}
        />

        <TemplateEditorPanel
          title="Archivmail"
          description="Vorlage für automatischen Archivversand und Test-Archivversand."
          subjectKey="archiveEmailSubjectTemplate"
          bodyKey="archiveEmailBodyTemplate"
          subject={settings.archiveEmailSubjectTemplate}
          body={settings.archiveEmailBodyTemplate}
          onChange={updateSetting}
          onFocusField={setActiveField}
        />

        <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Signatur</h2>
            <p className="text-sm text-gray-600 mt-1">
              Wird an Terminfenster-, Erinnerungs- und Archivmails angehängt.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Signaturtext
            </label>
            <textarea
              value={settings.emailSignature}
              rows={5}
              maxLength={2000}
              onFocus={() => setActiveField("emailSignature")}
              onChange={(e) => updateSetting("emailSignature", e.target.value.slice(0, 2000))}
              className="w-full px-3 py-2 border rounded-md text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
            <div className="text-xs text-gray-500 mt-1">{settings.emailSignature.length}/2000</div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2 pb-8">
          <button
            type="button"
            onClick={saveSettings}
            disabled={saving || loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Speichern..." : "Speichern"}
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            disabled={saving || loading}
            className="px-4 py-2 border border-gray-400 bg-white text-gray-800 text-sm font-medium rounded-md hover:bg-gray-100 disabled:opacity-50"
          >
            Standardtexte laden
          </button>
          {loading && <span className="text-sm text-gray-500">Lade...</span>}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 self-start">
        <PlaceholderHelp onInsert={insertPlaceholder} />
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Aktives Feld</h3>
          <p className="text-sm text-blue-800">
            Platzhalter werden in das zuletzt ausgewählte Feld eingefügt.
          </p>
        </div>
      </aside>
    </div>
  );
}
