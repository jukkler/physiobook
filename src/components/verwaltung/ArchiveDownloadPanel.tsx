"use client";

interface Props {
  weekLabel: string;
  monthLabel: string;
  yearLabel: string;
  downloading: string | null;
  onDownload: (type: "week" | "month" | "year") => void;
}

export default function ArchiveDownloadPanel({
  weekLabel,
  monthLabel,
  yearLabel,
  downloading,
  onDownload,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {/* Week */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Wochenarchiv
        </h3>
        <p className="text-lg font-medium text-gray-900 mb-4">
          {weekLabel}
        </p>
        <button
          onClick={() => onDownload("week")}
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
          {monthLabel}
        </p>
        <button
          onClick={() => onDownload("month")}
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
          {yearLabel}
        </p>
        <button
          onClick={() => onDownload("year")}
          disabled={downloading === "year"}
          className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {downloading === "year" ? "Wird erstellt..." : "PDF herunterladen"}
        </button>
      </div>
    </div>
  );
}
