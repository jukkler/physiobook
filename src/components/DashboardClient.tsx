"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import DayView from "./calendar/DayView";
import WeekView from "./calendar/WeekView";
import MonthView from "./calendar/MonthView";
import AppointmentForm from "./forms/AppointmentForm";
import BlockerForm from "./forms/BlockerForm";
import BlockerDeleteModal from "./dashboard/BlockerDeleteModal";
import BulkDeleteModal from "./dashboard/BulkDeleteModal";
import FindSlotDialog from "./dashboard/FindSlotDialog";
import PatientAppointmentsDialog from "./dashboard/PatientSearchDialog";
import RequestNotifier from "./RequestNotifier";
import { getWeekMonday, addDays, berlinDayStartMs, getMonthName, todayBerlin } from "@/lib/time";
import type { Appointment, AppointmentWithContact, Blocker } from "@/lib/db/schema";

type ViewMode = "day" | "week" | "month";

export default function DashboardClient() {
  const [date, setDate] = useState(todayBerlin);
  const [view, setView] = useState<ViewMode>("day");
  const [columnMode, setColumnMode] = useState<"split" | "single">("split");
  const [zoomLevel, setZoomLevel] = useState(100);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [mailboxPortal, setMailboxPortal] = useState<HTMLElement | null>(null);
  const [searchPortal, setSearchPortal] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById("header-toggle-portal"));
    setMailboxPortal(document.getElementById("header-mailbox-portal"));
    setSearchPortal(document.getElementById("header-search-portal"));
  }, []);

  // Load saved preferences
  useEffect(() => {
    fetch("/api/user/preferences")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.columnMode === "split" || data?.columnMode === "single") {
          setColumnMode(data.columnMode);
        }
        if (typeof data?.zoomLevel === "number") {
          setZoomLevel(data.zoomLevel);
        }
      })
      .catch((e) => console.warn("Preferences:", e));
  }, []);

  function changeZoom(delta: number) {
    setZoomLevel((prev) => {
      const next = Math.max(70, Math.min(200, prev + delta));
      fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoomLevel: next }),
      }).catch((e) => console.warn("Preferences:", e));
      return next;
    });
  }

  // Form state
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [showBlockerForm, setShowBlockerForm] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentWithContact | null>(null);
  const [newAppointmentStartMs, setNewAppointmentStartMs] = useState<number | undefined>();

  const [deletingBlocker, setDeletingBlocker] = useState<Blocker | null>(null);
  const [deleteScope, setDeleteScope] = useState<"single" | "group">("single");
  const [deleting, setDeleting] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showFindSlot, setShowFindSlot] = useState(false);
  const [selectedSearchPatient, setSelectedSearchPatient] = useState<{ id: string; name: string; email: string | null; phone: string | null } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; email: string | null; phone: string | null }[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Refresh key to force re-fetch in child components
  const [refreshKey, setRefreshKey] = useState(0);

  // Patient search in navbar
  function handleSearchInput(value: string) {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?q=${encodeURIComponent(value)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.patients || []);
          setShowSearchDropdown((data.patients || []).length > 0);
        }
      } catch { /* silent */ }
    }, 300);
  }

  function handleSelectSearchPatient(p: { id: string; name: string; email: string | null; phone: string | null }) {
    setSelectedSearchPatient(p);
    setShowSearchDropdown(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    }
    if (showSearchDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSearchDropdown]);

  function handleCreateAppointment(startTimeMs: number) {
    setNewAppointmentStartMs(startTimeMs);
    setEditingAppointment(null);
    setShowAppointmentForm(true);
  }

  function handleEditAppointment(appointment: AppointmentWithContact) {
    setEditingAppointment(appointment);
    setNewAppointmentStartMs(undefined);
    setShowAppointmentForm(true);
  }

  function handleFormSave() {
    setShowAppointmentForm(false);
    setShowBlockerForm(false);
    setEditingAppointment(null);
    setNewAppointmentStartMs(undefined);
    setRefreshKey((k) => k + 1);
  }

  function handleFormClose() {
    setShowAppointmentForm(false);
    setShowBlockerForm(false);
    setEditingAppointment(null);
    setNewAppointmentStartMs(undefined);
  }

  function handleBlockerClick(blocker: Blocker) {
    setDeletingBlocker(blocker);
    setDeleteScope("single");
  }

  async function handleDeleteBlocker() {
    if (!deletingBlocker) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/blockers/${deletingBlocker.id}?scope=${deleteScope}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setDeletingBlocker(null);
        setRefreshKey((k) => k + 1);
      }
    } catch {
      // network error
    } finally {
      setDeleting(false);
    }
  }

  function getBulkDeleteRange(): { from: number; to: number } {
    if (view === "day") {
      const dayStart = berlinDayStartMs(date);
      return { from: dayStart, to: dayStart + 24 * 60 * 60 * 1000 };
    } else if (view === "week") {
      const monday = getWeekMonday(date);
      const weekStart = berlinDayStartMs(monday);
      return { from: weekStart, to: weekStart + 7 * 24 * 60 * 60 * 1000 };
    } else {
      const [y, m] = date.split("-").map(Number);
      const monthStart = berlinDayStartMs(`${y}-${String(m).padStart(2, "0")}-01`);
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const monthEnd = berlinDayStartMs(nextMonth);
      return { from: monthStart, to: monthEnd };
    }
  }

  function getBulkDeleteLabel(): { title: string; description: string } {
    const fmt = (d: string) => d.split("-").reverse().slice(0, 2).join(".");
    if (view === "day") {
      return { title: "Tag löschen", description: `Alle Termine am ${fmt(date)}` };
    } else if (view === "week") {
      const m = getWeekMonday(date);
      const s = addDays(m, 6);
      return { title: "Woche löschen", description: `Alle Termine der Woche ${fmt(m)} – ${fmt(s)}` };
    } else {
      return { title: "Monat löschen", description: `Alle Termine im ${getMonthName(date)}` };
    }
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    try {
      const { from, to } = getBulkDeleteRange();
      const res = await fetch(
        `/api/appointments/bulk?from=${from}&to=${to}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setShowBulkDelete(false);
        setRefreshKey((k) => k + 1);
      }
    } catch {
      // network error
    } finally {
      setBulkDeleting(false);
    }
  }

  function handleDayClick(clickedDate: string) {
    setDate(clickedDate);
    setView("day");
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* View Toggle + Actions */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setView("day")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === "day"
                ? "bg-white shadow text-gray-900 font-medium"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Tag
          </button>
          <button
            onClick={() => setView("week")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === "week"
                ? "bg-white shadow text-gray-900 font-medium"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Woche
          </button>
          <button
            onClick={() => setView("month")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === "month"
                ? "bg-white shadow text-gray-900 font-medium"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Monat
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setNewAppointmentStartMs(undefined);
              setEditingAppointment(null);
              setShowAppointmentForm(true);
            }}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            + Termin
          </button>
          <button
            onClick={() => setShowFindSlot(true)}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Termin finden
          </button>
          <button
            onClick={() => setShowBlockerForm(true)}
            className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800"
          >
            + Blocker
          </button>
          <button
            onClick={() => setShowBulkDelete(true)}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            {view === "day" ? "Tag" : view === "week" ? "Woche" : "Monat"} löschen
          </button>
        </div>
      </div>

      {/* Calendar View */}
      <div className="flex-1 min-h-0 flex flex-col" style={{ zoom: `${zoomLevel}%` }}>
        {view === "day" ? (
          <DayView
            key={`day-${refreshKey}`}
            date={date}
            columnMode={columnMode}
            onDateChange={setDate}
            onCreateAppointment={handleCreateAppointment}
            onEditAppointment={handleEditAppointment}
            onBlockerClick={handleBlockerClick}
          />
        ) : view === "week" ? (
          <WeekView
            key={`week-${refreshKey}`}
            date={date}
            onDateChange={setDate}
            onDayClick={handleDayClick}
            onBlockerClick={handleBlockerClick}
          />
        ) : (
          <MonthView
            key={`month-${refreshKey}`}
            date={date}
            onDateChange={setDate}
            onDayClick={handleDayClick}
            onBlockerClick={handleBlockerClick}
          />
        )}
      </div>

      {/* Zoom Controls */}
      <div className="fixed bottom-4 right-4 flex items-center gap-1 bg-white rounded-lg shadow-lg border border-gray-200 p-1 z-40">
        <button
          onClick={() => changeZoom(-10)}
          disabled={zoomLevel <= 70}
          className="w-8 h-8 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
          title="Verkleinern"
        >
          &minus;
        </button>
        <span className="text-xs text-gray-500 w-8 text-center">{zoomLevel}%</span>
        <button
          onClick={() => changeZoom(10)}
          disabled={zoomLevel >= 200}
          className="w-8 h-8 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
          title="Vergrößern"
        >
          +
        </button>
      </div>

      {/* Modals */}
      {selectedSearchPatient && (
        <PatientAppointmentsDialog
          patient={selectedSearchPatient}
          onClose={() => setSelectedSearchPatient(null)}
          onGoToDate={(d) => { setDate(d); setView("day"); }}
        />
      )}

      {showFindSlot && (
        <FindSlotDialog
          onSelectSlot={(startTimeMs) => {
            setShowFindSlot(false);
            handleCreateAppointment(startTimeMs);
          }}
          onClose={() => setShowFindSlot(false)}
        />
      )}

      {showAppointmentForm && (
        <AppointmentForm
          appointment={editingAppointment ?? undefined}
          defaultStartTime={newAppointmentStartMs}
          onSave={handleFormSave}
          onClose={handleFormClose}
        />
      )}

      {showBlockerForm && (
        <BlockerForm
          defaultStartTime={newAppointmentStartMs}
          onSave={handleFormSave}
          onClose={handleFormClose}
        />
      )}

      {deletingBlocker && (
        <BlockerDeleteModal
          blocker={deletingBlocker}
          deleteScope={deleteScope}
          deleting={deleting}
          onScopeChange={setDeleteScope}
          onConfirm={handleDeleteBlocker}
          onClose={() => setDeletingBlocker(null)}
        />
      )}

      {showBulkDelete && (() => {
        const { title, description } = getBulkDeleteLabel();
        return (
          <BulkDeleteModal
            title={title}
            description={description}
            deleting={bulkDeleting}
            onConfirm={handleBulkDelete}
            onClose={() => setShowBulkDelete(false)}
          />
        );
      })()}

      <RequestNotifier
        onAction={() => setRefreshKey((k) => k + 1)}
        portalTarget={mailboxPortal}
      />

      {searchPortal && createPortal(
        <div className="relative" ref={searchContainerRef}>
          <input
            type="text"
            placeholder="Patient suchen..."
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="w-80 px-4 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectSearchPatient(p)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                >
                  <div className="text-sm font-medium text-gray-900">{p.name}</div>
                  <div className="text-xs text-gray-500">
                    {[p.email, p.phone].filter(Boolean).join(" · ") || "Keine Kontaktdaten"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>,
        searchPortal
      )}

      {portalTarget && view === "day" && createPortal(
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Geteilt</span>
          <button
            onClick={() => {
              const next = columnMode === "split" ? "single" : "split";
              setColumnMode(next);
              fetch("/api/user/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ columnMode: next }),
              }).catch((e) => console.warn("Preferences:", e));
            }}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              columnMode === "single" ? "bg-blue-500" : "bg-gray-300"
            }`}
            title={columnMode === "split" ? "Ganztagesansicht" : "Geteilte Ansicht"}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                columnMode === "single" ? "translate-x-5" : ""
              }`}
            />
          </button>
          <span className="text-xs text-gray-500">Ganztag</span>
        </div>,
        portalTarget
      )}
    </div>
  );
}
