"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Modal from "./ui/Modal";
import { formatBerlinDate, formatBerlinTime } from "@/lib/time";

interface PendingRequest {
  id: string;
  patientName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  notes: string | null;
  createdAt: number;
}

interface RequestNotifierProps {
  onAction: () => void;
  portalTarget: HTMLElement | null;
}

const POLL_INTERVAL = 120_000; // 2 minutes

export default function RequestNotifier({ onAction, portalTarget }: RequestNotifierProps) {
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [toasts, setToasts] = useState<PendingRequest[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const knownIdsRef = useRef<Set<string>>(new Set());
  const isFirstPollRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch("/api/requests/pending");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) return;

      const data = await res.json();
      const requests: PendingRequest[] = data.requests;
      setPendingRequests(requests);

      if (isFirstPollRef.current) {
        // First load: populate known IDs without showing toasts
        knownIdsRef.current = new Set(requests.map((r) => r.id));
        isFirstPollRef.current = false;
      } else {
        // Subsequent polls: detect new requests
        const newRequests = requests.filter((r) => !knownIdsRef.current.has(r.id));
        if (newRequests.length > 0) {
          setToasts((prev) => [...newRequests, ...prev]);
          for (const r of newRequests) {
            knownIdsRef.current.add(r.id);
          }
        }
      }
    } catch {
      // Network error — silently continue polling
    }
  }, []);

  // Polling with visibility handling
  useEffect(() => {
    fetchPending();

    function startPolling() {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(fetchPending, POLL_INTERVAL);
    }

    function handleVisibility() {
      if (document.hidden) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        fetchPending();
        startPolling();
      }
    }

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchPending]);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!showDropdown) return;

    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowDropdown(false);
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showDropdown]);

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function openDetail(req: PendingRequest) {
    setSelectedRequest(req);
    setShowDropdown(false);
    setActionError("");
  }

  function removeRequest(id: string) {
    setPendingRequests((prev) => prev.filter((r) => r.id !== id));
    setToasts((prev) => prev.filter((t) => t.id !== id));
    knownIdsRef.current.delete(id);
  }

  async function handleAction(action: "confirm" | "reject") {
    if (!selectedRequest) return;
    setActionLoading(true);
    setActionError("");

    try {
      const res = await fetch(`/api/requests/${selectedRequest.id}/${action}`, {
        method: "POST",
      });

      if (res.ok || res.status === 409) {
        removeRequest(selectedRequest.id);
        setSelectedRequest(null);
        onAction();
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Ein Fehler ist aufgetreten");
      }
    } catch {
      setActionError("Netzwerkfehler");
    } finally {
      setActionLoading(false);
    }
  }

  const count = pendingRequests.length;

  const mailboxIcon = (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown((v) => !v)}
        className="relative p-1.5 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
        aria-label={count > 0 ? `${count} offene Anfragen` : "Keine offenen Anfragen"}
        title={count > 0 ? `${count} offene Anfragen` : "Keine offenen Anfragen"}
      >
        {/* Envelope SVG */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
        {/* Badge */}
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-[45]">
          <div className="p-3 border-b border-gray-100 font-medium text-sm text-gray-700">
            Terminanfragen
          </div>
          {count === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">
              Keine offenen Anfragen
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {pendingRequests.map((req) => (
                <button
                  key={req.id}
                  onClick={() => openDetail(req)}
                  className="w-full text-left px-3 py-2.5 hover:bg-amber-50 border-b border-gray-50 last:border-b-0 transition-colors"
                >
                  <div className="font-medium text-sm text-gray-900">{req.patientName}</div>
                  <div className="text-xs text-gray-500">
                    {formatBerlinDate(req.startTime)}, {formatBerlinTime(req.startTime)} Uhr
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mailbox Icon — portaled to header if target available */}
      {portalTarget ? createPortal(mailboxIcon, portalTarget) : mailboxIcon}

      {/* Persistent Toasts (top-right) */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[45] flex flex-col gap-2 w-80">
          {toasts.slice(0, 3).map((req) => (
            <div
              key={req.id}
              className="bg-amber-100 border border-amber-300 rounded-lg shadow-lg p-3 cursor-pointer hover:bg-amber-50 transition-colors"
              onClick={() => openDetail(req)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-amber-900">
                    Neue Terminanfrage
                  </div>
                  <div className="text-sm text-amber-800 truncate">
                    {req.patientName}
                  </div>
                  <div className="text-xs text-amber-700">
                    {formatBerlinDate(req.startTime)}, {formatBerlinTime(req.startTime)} Uhr
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissToast(req.id);
                  }}
                  className="text-amber-400 hover:text-amber-600 text-lg leading-none flex-shrink-0"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedRequest && (
        <Modal title="Terminanfrage" onClose={() => setSelectedRequest(null)} maxWidth="md">
          <div className="space-y-3">
            <div>
              <span className="text-sm text-gray-500">Patient</span>
              <p className="font-semibold text-gray-900">{selectedRequest.patientName}</p>
            </div>
            {selectedRequest.contactEmail && (
              <div>
                <span className="text-sm text-gray-500">E-Mail</span>
                <p className="text-gray-900">{selectedRequest.contactEmail}</p>
              </div>
            )}
            {selectedRequest.contactPhone && (
              <div>
                <span className="text-sm text-gray-500">Telefon</span>
                <p className="text-gray-900">{selectedRequest.contactPhone}</p>
              </div>
            )}
            <div>
              <span className="text-sm text-gray-500">Termin</span>
              <p className="text-gray-900">
                {formatBerlinDate(selectedRequest.startTime)}, {formatBerlinTime(selectedRequest.startTime)} – {formatBerlinTime(selectedRequest.endTime)} Uhr
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Dauer</span>
              <p className="text-gray-900">{selectedRequest.durationMinutes} Minuten</p>
            </div>
            {selectedRequest.notes && (
              <div>
                <span className="text-sm text-gray-500">Nachricht</span>
                <p className="text-gray-900">{selectedRequest.notes}</p>
              </div>
            )}
          </div>

          {actionError && (
            <div className="mt-3 text-sm text-red-600 bg-red-50 rounded p-2">
              {actionError}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => handleAction("confirm")}
              disabled={actionLoading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {actionLoading ? "..." : "Bestätigen"}
            </button>
            <button
              onClick={() => handleAction("reject")}
              disabled={actionLoading}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {actionLoading ? "..." : "Ablehnen"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
