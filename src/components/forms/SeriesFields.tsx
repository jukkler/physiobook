"use client";

import { formatBerlinDate, formatBerlinTime } from "@/lib/time";

interface SeriesFieldsProps {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  intervalWeeks: number;
  onIntervalWeeksChange: (value: number) => void;
  count: number;
  onCountChange: (value: number) => void;
  permanent: boolean;
  onPermanentChange: (value: boolean) => void;
  startTime: number;
  durationMinutes: number;
}

export default function SeriesFields({
  enabled,
  onEnabledChange,
  intervalWeeks,
  onIntervalWeeksChange,
  count,
  onCountChange,
  permanent,
  onPermanentChange,
  startTime,
  durationMinutes,
}: SeriesFieldsProps) {
  const effectiveCount = permanent ? 52 : count;
  const preview = Array.from({ length: Math.min(effectiveCount, 5) }, (_, index) => {
    const start = startTime + index * intervalWeeks * 7 * 86_400_000;
    return { start, end: start + durationMinutes * 60_000 };
  });

  return (
    <section className="border rounded-md p-3 space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="rounded"
        />
        Serientermin
      </label>

      {enabled && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Intervall
            </label>
            <select
              value={intervalWeeks}
              onChange={(event) => onIntervalWeeksChange(Number(event.target.value))}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>Wöchentlich</option>
              <option value={2}>Alle 2 Wochen</option>
              <option value={3}>Alle 3 Wochen</option>
              <option value={4}>Alle 4 Wochen</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={permanent}
              onChange={(event) => onPermanentChange(event.target.checked)}
              className="rounded"
            />
            Dauerpatient für 1 Jahr
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anzahl Termine
            </label>
            <input
              type="number"
              min={1}
              max={52}
              value={effectiveCount}
              disabled={permanent}
              onChange={(event) => onCountChange(Math.max(1, Math.min(52, Number(event.target.value))))}
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${permanent ? "bg-gray-100 text-gray-400 cursor-not-allowed" : ""}`}
            />
          </div>

          <div className="text-xs text-gray-500 space-y-1">
            <p>{effectiveCount} Termine, {intervalWeeks === 1 ? "wöchentlich" : `alle ${intervalWeeks} Wochen`}</p>
            <ul className="space-y-1">
              {preview.map((item, index) => (
                <li key={index}>
                  {formatBerlinDate(item.start).split(",")[0]} {formatBerlinTime(item.start)}-{formatBerlinTime(item.end)}
                </li>
              ))}
            </ul>
            {effectiveCount > preview.length && (
              <p>+ {effectiveCount - preview.length} weitere Termine</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
