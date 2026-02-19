"use client";

import { useState } from "react";
import DayView from "./calendar/DayView";
import WeekView from "./calendar/WeekView";
import AppointmentForm from "./forms/AppointmentForm";
import BlockerForm from "./forms/BlockerForm";

interface Appointment {
  id: string;
  patientName: string;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  status: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  seriesId?: string | null;
}

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

  // Form state
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [showBlockerForm, setShowBlockerForm] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [newAppointmentStartMs, setNewAppointmentStartMs] = useState<number | undefined>();

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

  function handleDayClick(clickedDate: string) {
    setDate(clickedDate);
    setView("day");
  }

  return (
    <div>
      {/* View Toggle + Actions */}
      <div className="flex items-center justify-between mb-4">
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
      {view === "day" ? (
        <DayView
          key={`day-${refreshKey}`}
          date={date}
          onDateChange={setDate}
          onCreateAppointment={handleCreateAppointment}
          onEditAppointment={handleEditAppointment}
        />
      ) : (
        <WeekView
          key={`week-${refreshKey}`}
          date={date}
          onDateChange={setDate}
          onDayClick={handleDayClick}
        />
      )}

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
    </div>
  );
}
