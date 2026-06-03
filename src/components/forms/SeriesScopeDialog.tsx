"use client";

import type { AppointmentSeriesScope } from "@/lib/db/schema";

interface SeriesScopeDialogProps {
  mode: "save" | "delete";
  onChoose: (scope: AppointmentSeriesScope) => void;
  onCancel: () => void;
  saving: boolean;
}

export default function SeriesScopeDialog({ mode, onChoose, onCancel, saving }: SeriesScopeDialogProps) {
  const verb = mode === "delete" ? "gelöscht" : "geändert";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Serie bearbeiten</h3>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-700">Welche Termine sollen {verb} werden?</p>
          <button
            type="button"
            disabled={saving}
            onClick={() => onChoose("single")}
            className="w-full px-3 py-2 border rounded-md text-sm text-left hover:bg-gray-50 disabled:opacity-50"
          >
            Nur dieser Termin
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onChoose("future")}
            className="w-full px-3 py-2 border rounded-md text-sm text-left hover:bg-gray-50 disabled:opacity-50"
          >
            Dieser und folgende Termine
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onChoose("series")}
            className="w-full px-3 py-2 border rounded-md text-sm text-left hover:bg-gray-50 disabled:opacity-50"
          >
            Ganze Serie
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
