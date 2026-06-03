"use client";

interface PracticeInfoPanelProps {
  practiceInfo: {
    practiceName: string;
    practiceAddress: string;
    practicePhone: string;
  };
  saving: boolean;
  message: { type: "success" | "error"; text: string } | null;
  onChange: (key: "practiceName" | "practiceAddress" | "practicePhone", value: string) => void;
  onSave: () => void;
}

export default function PracticeInfoPanel({
  practiceInfo,
  saving,
  message,
  onChange,
  onSave,
}: PracticeInfoPanelProps) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Praxisinformationen</h3>
      <p className="text-sm text-gray-600 mb-4">
        Diese Angaben werden für E-Mail-Platzhalter wie @Praxisname, @Praxisadresse und @Praxistelefon verwendet.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={practiceInfo.practiceName}
            maxLength={200}
            onChange={(e) => onChange("practiceName", e.target.value.slice(0, 200))}
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Praxisname"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
          <input
            type="text"
            value={practiceInfo.practiceAddress}
            maxLength={200}
            onChange={(e) => onChange("practiceAddress", e.target.value.slice(0, 200))}
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Straße, PLZ Ort"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
          <input
            type="tel"
            value={practiceInfo.practicePhone}
            maxLength={200}
            onChange={(e) => onChange("practicePhone", e.target.value.slice(0, 200))}
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Telefonnummer"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Speichern..." : "Speichern"}
        </button>
        {message && (
          <span className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </span>
        )}
      </div>
    </section>
  );
}
