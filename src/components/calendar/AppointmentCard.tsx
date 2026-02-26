"use client";

import { formatBerlinTime } from "@/lib/time";

interface AppointmentCardProps {
  id: string;
  patientName: string;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  status: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  onConfirm?: (id: string) => void;
  onReject?: (id: string) => void;
  onClick?: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: "bg-blue-100 border-blue-300 text-blue-900",
  REQUESTED: "bg-amber-100 border-amber-300 text-amber-900",
  CANCELLED: "bg-gray-100 border-gray-300 text-gray-500 line-through",
  EXPIRED: "bg-gray-100 border-gray-300 text-gray-400",
};

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Bestätigt",
  REQUESTED: "Anfrage",
  CANCELLED: "Abgesagt",
  EXPIRED: "Verfallen",
};

export default function AppointmentCard({
  id,
  patientName,
  startTime,
  endTime,
  durationMinutes,
  status,
  notes,
  onConfirm,
  onReject,
  onClick,
}: AppointmentCardProps) {
  const colorClass = STATUS_COLORS[status] || STATUS_COLORS.CONFIRMED;

  return (
    <div
      className={`border rounded-md px-2 py-0.5 text-sm cursor-pointer hover:shadow-sm transition-shadow h-full overflow-hidden ${colorClass}`}
      onClick={() => onClick?.(id)}
    >
      {/* Primary row: always visible */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium truncate">{patientName}</span>
        {status === "REQUESTED" && (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfirm?.(id);
              }}
              className="text-xs px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700"
            >
              OK
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReject?.(id);
              }}
              className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700"
            >
              X
            </button>
          </div>
        )}
      </div>
      {/* Secondary row: notes, only if space allows */}
      {notes && (
        <div className="text-xs opacity-60 truncate">{notes}</div>
      )}
    </div>
  );
}
