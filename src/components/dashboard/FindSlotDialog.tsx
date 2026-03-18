"use client";

import { useState, useEffect, useCallback } from "react";
import Modal from "@/components/ui/Modal";

interface FreeSlot {
  startTimeMs: number;
  endTimeMs: number;
  startTimeLocal: string;
  endTimeLocal: string;
  dateStr: string;
  weekday: string;
}

interface FindSlotDialogProps {
  onSelectSlot: (startTimeMs: number) => void;
  onClose: () => void;
}

export default function FindSlotDialog({ onSelectSlot, onClose }: FindSlotDialogProps) {
  const [page, setPage] = useState(0);
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const fetchSlots = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/slots/next-free?count=5&offset=${p * 5}`);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setSlots(data.slots);
      setHasMore(data.hasMore);
    } catch {
      setSlots([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlots(page);
  }, [page, fetchSlots]);

  function formatDate(dateStr: string): string {
    const [y, m, d] = dateStr.split("-");
    return `${d}.${m}.${y}`;
  }

  return (
    <Modal title="Termin finden" onClose={onClose}>
      {loading ? (
        <div className="text-center py-8 text-gray-500">Laden...</div>
      ) : slots.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Keine freien Termine in den nächsten 3 Monaten gefunden.
        </div>
      ) : (
        <div className="space-y-1">
          {slots.map((slot) => (
            <button
              key={`${slot.dateStr}-${slot.startTimeLocal}`}
              onClick={() => onSelectSlot(slot.startTimeMs)}
              className="w-full text-left px-3 py-2.5 rounded-md hover:bg-blue-50 transition-colors flex items-center gap-3 group"
            >
              <span className="text-sm font-medium text-gray-500 w-6">{slot.weekday}</span>
              <span className="text-sm text-gray-900">{formatDate(slot.dateStr)}</span>
              <span className="text-sm text-blue-600 font-medium ml-auto">
                {slot.startTimeLocal} – {slot.endTimeLocal}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-2 border-t">
        <button
          onClick={() => setPage((p) => p - 1)}
          disabled={page === 0}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Zurück
        </button>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Weiter
        </button>
      </div>
    </Modal>
  );
}
