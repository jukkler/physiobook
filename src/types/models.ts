export interface Appointment {
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

export interface Blocker {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  blockerGroupId?: string | null;
}

export interface Settings {
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
  slotDuration: string;
}
