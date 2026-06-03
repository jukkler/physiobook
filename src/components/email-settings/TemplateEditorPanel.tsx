"use client";

import type { EmailTemplateKey } from "@/lib/email-template-defaults";

interface TemplateEditorPanelProps {
  title: string;
  description: string;
  subjectKey: EmailTemplateKey;
  bodyKey: EmailTemplateKey;
  subject: string;
  body: string;
  onChange: (key: EmailTemplateKey, value: string) => void;
  onFocusField: (key: EmailTemplateKey) => void;
}

export default function TemplateEditorPanel({
  title,
  description,
  subjectKey,
  bodyKey,
  subject,
  body,
  onChange,
  onFocusField,
}: TemplateEditorPanelProps) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Betreff
        </label>
        <input
          type="text"
          value={subject}
          maxLength={120}
          onFocus={() => onFocusField(subjectKey)}
          onChange={(e) => onChange(subjectKey, e.target.value.slice(0, 120))}
          className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="text-xs text-gray-500 mt-1">{subject.length}/120</div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nachricht
        </label>
        <textarea
          value={body}
          rows={9}
          maxLength={4000}
          onFocus={() => onFocusField(bodyKey)}
          onChange={(e) => onChange(bodyKey, e.target.value.slice(0, 4000))}
          className="w-full px-3 py-2 border rounded-md text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
        <div className="text-xs text-gray-500 mt-1">{body.length}/4000</div>
      </div>
    </section>
  );
}
