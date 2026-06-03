"use client";

import { formatBerlinDate, formatBerlinTime } from "@/lib/time";
import type { AppointmentSeriesSummary } from "@/lib/db/schema";

interface SeriesSummaryProps {
  summary: AppointmentSeriesSummary;
}

export default function SeriesSummary({ summary }: SeriesSummaryProps) {
  const intervalLabel = summary.intervalWeeks === 1 ? "wöchentlich" : `alle ${summary.intervalWeeks} Wochen`;
  const positionLabel = summary.occurrenceIndex === null ? "" : `Termin ${summary.occurrenceIndex + 1} von ${summary.occurrenceCount}`;
  const exceptionLabel =
    summary.exceptionType === "moved"
      ? "Einzeln verschoben"
      : summary.exceptionType === "cancelled"
        ? "Einzeln abgesagt"
        : summary.exceptionType === "detached"
          ? "Aus Serie gelöst"
          : null;

  return (
    <section className="bg-gray-50 border rounded-md p-3 space-y-1">
      <p className="text-sm font-medium text-gray-800">Teil einer Serie</p>
      <p className="text-xs text-gray-600">
        {intervalLabel}, {summary.occurrenceCount} Termine
      </p>
      <p className="text-xs text-gray-500">
        {formatBerlinDate(summary.firstStartTime).split(",")[0]} {formatBerlinTime(summary.firstStartTime)} bis {formatBerlinDate(summary.lastStartTime).split(",")[0]}
      </p>
      {positionLabel && <p className="text-xs text-gray-500">{positionLabel}</p>}
      {exceptionLabel && <p className="text-xs text-amber-700">{exceptionLabel}</p>}
    </section>
  );
}
