"use client";

interface Props {
  reminderEnabled: string;
  reminderSaving: boolean;
  reminderMessage: { type: "success" | "error"; text: string } | null;
  emailListOpen: boolean;
  emailList: string[];
  emailListLoading: boolean;
  onToggle: () => void;
  onSave: () => void;
  onToggleEmailList: () => void;
}

export default function ReminderSettingsPanel({
  reminderEnabled,
  reminderSaving,
  reminderMessage,
  emailListOpen,
  emailList,
  emailListLoading,
  onToggle,
  onSave,
  onToggleEmailList,
}: Props) {
  return (
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
            onClick={onToggle}
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
            onClick={onSave}
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
            onClick={onToggleEmailList}
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
  );
}
