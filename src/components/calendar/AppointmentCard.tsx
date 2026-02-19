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
      className={`border rounded-md p-2 text-sm cursor-pointer hover:shadow-sm transition-shadow h-full overflow-hidden ${colorClass}`}
      onClick={() => onClick?.(id)}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium truncate">{patientName}</span>
        <span className="text-xs opacity-70">{durationMinutes} Min.</span>
      </div>
      <div className="text-xs opacity-80">
        {formatBerlinTime(startTime)} – {formatBerlinTime(endTime)}
      </div>
      {notes && (
        <div className="text-xs opacity-60 truncate mt-0.5">{notes}</div>
      )}
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs font-medium">{STATUS_LABELS[status]}</span>
        {status === "REQUESTED" && (
          <div className="flex gap-1">
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
    </div>
  );
}
