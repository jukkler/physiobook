"use client";

interface Props {
  smtpSettings: {
    smtpHost: string;
    smtpPort: string;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    adminNotifyEmail: string;
  };
  smtpLoaded: boolean;
  smtpSaving: boolean;
  smtpMessage: { type: "success" | "error"; text: string } | null;
  testEmail: string;
  testSending: boolean;
  testMessage: { type: "success" | "error"; text: string } | null;
  onSmtpChange: (key: string, value: string) => void;
  onSmtpSave: () => void;
  onTestEmailChange: (value: string) => void;
  onTestEmailSend: () => void;
}

export default function SmtpSettingsPanel({
  smtpSettings,
  smtpLoaded,
  smtpSaving,
  smtpMessage,
  testEmail,
  testSending,
  testMessage,
  onSmtpChange,
  onSmtpSave,
  onTestEmailChange,
  onTestEmailSend,
}: Props) {
  return (
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
                onChange={(e) => onSmtpChange("smtpHost", e.target.value)}
                placeholder="smtp.beispiel.de"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
              <input
                type="number"
                value={smtpSettings.smtpPort}
                onChange={(e) => onSmtpChange("smtpPort", e.target.value)}
                placeholder="587"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Benutzername</label>
              <input
                type="text"
                value={smtpSettings.smtpUser}
                onChange={(e) => onSmtpChange("smtpUser", e.target.value)}
                placeholder="user@beispiel.de"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
              <input
                type="password"
                value={smtpSettings.smtpPass}
                onChange={(e) => onSmtpChange("smtpPass", e.target.value)}
                placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Absenderadresse</label>
              <input
                type="email"
                value={smtpSettings.smtpFrom}
                onChange={(e) => onSmtpChange("smtpFrom", e.target.value)}
                placeholder="noreply@beispiel.de"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Benachrichtigungs-E-Mail</label>
              <input
                type="email"
                value={smtpSettings.adminNotifyEmail}
                onChange={(e) => onSmtpChange("adminNotifyEmail", e.target.value)}
                placeholder="praxis@beispiel.de"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onSmtpSave}
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
                onChange={(e) => onTestEmailChange(e.target.value)}
                placeholder="empfaenger@beispiel.de"
                className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={onTestEmailSend}
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
  );
}
