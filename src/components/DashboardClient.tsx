"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import DayView from "./calendar/DayView";
import WeekView from "./calendar/WeekView";
import AppointmentForm from "./forms/AppointmentForm";
import BlockerForm from "./forms/BlockerForm";
import type { Appointment, Blocker } from "@/types/models";

type ViewMode = "day" | "week";

export default function DashboardClient() {
  const todayBerlin = () => {
    const now = new Date();
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
    }).format(now);
  };

  const [date, setDate] = useState(todayBerlin);
  const [view, setView] = useState<ViewMode>("day");
  const [columnMode, setColumnMode] = useState<"split" | "single">("split");
  const [zoomLevel, setZoomLevel] = useState(100);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById("header-toggle-portal"));
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
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [newAppointmentStartMs, setNewAppointmentStartMs] = useState<number | undefined>();

  const [deletingBlocker, setDeletingBlocker] = useState<Blocker | null>(null);
  const [deleteScope, setDeleteScope] = useState<"single" | "group">("single");
  const [deleting, setDeleting] = useState(false);

  // Refresh key to force re-fetch in child components
  const [refreshKey, setRefreshKey] = useState(0);

  function handleCreateAppointment(startTimeMs: number) {
    setNewAppointmentStartMs(startTimeMs);
    setEditingAppointment(null);
    setShowAppointmentForm(true);
  }

  function handleEditAppointment(appointment: Appointment) {
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
            onClick={() => setShowBlockerForm(true)}
            className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800"
          >
            + Blocker
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
        ) : (
          <WeekView
            key={`week-${refreshKey}`}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Blocker löschen</h2>
              <button
                onClick={() => setDeletingBlocker(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-700">
                Blocker <strong>&quot;{deletingBlocker.title}&quot;</strong> wirklich löschen?
              </p>

              {deletingBlocker.blockerGroupId && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="blockerDeleteScope"
                      checked={deleteScope === "single"}
                      onChange={() => setDeleteScope("single")}
                    />
                    <span className="text-gray-700">Nur diesen Blocker</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="blockerDeleteScope"
                      checked={deleteScope === "group"}
                      onChange={() => setDeleteScope("group")}
                    />
                    <span className="text-gray-700">Alle Blocker dieser Gruppe</span>
                  </label>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleDeleteBlocker}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "Löschen..." : "Löschen"}
                </button>
                <button
                  onClick={() => setDeletingBlocker(null)}
                  className="px-4 py-2 border text-sm rounded-md hover:bg-gray-50"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
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
