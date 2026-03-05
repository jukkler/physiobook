"use client";

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  labelOn?: string;
  labelOff?: string;
}

export default function Toggle({
  enabled,
  onChange,
  labelOn = "Aktiviert",
  labelOff = "Deaktiviert",
}: ToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          enabled ? "bg-blue-500" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            enabled ? "translate-x-5" : ""
          }`}
        />
      </button>
      <span className="text-sm text-gray-700">
        {enabled ? labelOn : labelOff}
      </span>
    </div>
  );
}
