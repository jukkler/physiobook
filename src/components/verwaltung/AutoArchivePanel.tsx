"use client";

interface Props {
  autoArchive: {
    autoArchiveEnabled: string;
    autoArchiveInterval: string;
    autoArchiveType: string;
    autoArchiveEmail: string;
    cronJobEmail: string;
  };
  autoArchiveSaving: boolean;
  autoArchiveMessage: { type: "success" | "error"; text: string } | null;
  testArchiveSending: boolean;
  testArchiveMessage: { type: "success" | "error"; text: string } | null;
  onAutoArchiveChange: (updates: Record<string, string>) => void;
  onSave: () => void;
  onTestArchive: () => void;
}

export default function AutoArchivePanel({
  autoArchive,
  autoArchiveSaving,
  autoArchiveMessage,
  testArchiveSending,
  testArchiveMessage,
  onAutoArchiveChange,
  onSave,
  onTestArchive,
}: Props) {
  return (
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
            onClick={() =>
              onAutoArchiveChange({
                autoArchiveEnabled:
                  autoArchive.autoArchiveEnabled === "true" ? "false" : "true",
              })
            }
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
              onChange={(e) => onAutoArchiveChange({ autoArchiveInterval: e.target.value })}
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
              onChange={(e) => onAutoArchiveChange({ autoArchiveType: e.target.value })}
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
              onChange={(e) => onAutoArchiveChange({ autoArchiveEmail: e.target.value })}
              placeholder="archiv@beispiel.de"
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Weitere E-Mail (Cron-Job)</label>
            <input
              type="email"
              value={autoArchive.cronJobEmail}
              onChange={(e) => onAutoArchiveChange({ cronJobEmail: e.target.value })}
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
            onClick={onSave}
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
              onClick={onTestArchive}
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
  );
}
