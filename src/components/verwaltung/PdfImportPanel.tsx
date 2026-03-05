"use client";

import React from "react";

interface Props {
  pdfInputRef: React.RefObject<HTMLInputElement | null>;
  pdfImporting: boolean;
  pdfMessage: { type: "success" | "error"; text: string } | null;
  pdfDebug: string | null;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadClick: () => void;
}

export default function PdfImportPanel({
  pdfInputRef,
  pdfImporting,
  pdfMessage,
  pdfDebug,
  onImport,
  onUploadClick,
}: Props) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Termine aus PDF importieren
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Lade eine Archiv-PDF hoch, um Termine wiederherzustellen.
      </p>
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf"
        onChange={onImport}
        className="hidden"
      />
      <div className="flex gap-2">
        <button
          onClick={onUploadClick}
          disabled={pdfImporting}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pdfImporting ? "Importiere..." : "PDF hochladen"}
        </button>
      </div>
      {pdfMessage && (
        <p className={`mt-3 text-sm ${pdfMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
          {pdfMessage.text}
        </p>
      )}
      {pdfDebug && (
        <pre className="mt-3 text-xs bg-gray-100 p-3 rounded overflow-auto max-h-64 whitespace-pre-wrap">
          {pdfDebug}
        </pre>
      )}
    </div>
  );
}
