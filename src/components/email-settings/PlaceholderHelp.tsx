"use client";

import { EMAIL_PLACEHOLDERS } from "@/lib/email-template-defaults";

interface PlaceholderHelpProps {
  onInsert?: (token: string) => void;
}

export default function PlaceholderHelp({ onInsert }: PlaceholderHelpProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Platzhalter</h3>
      <p className="text-sm text-gray-600 mb-3">
        Platzhalter werden beim Versand automatisch ersetzt.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {EMAIL_PLACEHOLDERS.map((item) => (
          <button
            key={item.token}
            type="button"
            onClick={() => onInsert?.(item.token)}
            className="text-left border border-gray-200 rounded-md px-3 py-2 hover:border-blue-300 hover:bg-blue-50"
          >
            <code className="text-sm font-semibold text-blue-700">{item.token}</code>
            <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
