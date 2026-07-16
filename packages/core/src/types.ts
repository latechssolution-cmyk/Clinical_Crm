export interface AvailabilityRule {
  doctorId: string;
  /** 0 = Sunday ... 6 = Saturday (clinic-local weekday) */
  weekday: number;
  /** "HH:MM" clinic-local */
  startTime: string;
  endTime: string;
}

export interface AvailabilityException {
  doctorId: string;
  /** "YYYY-MM-DD" clinic-local */
  date: string;
  kind: 'blocked' | 'extra';
  /** null/undefined = whole day (only meaningful for 'blocked') */
  startTime?: string | null;
  endTime?: string | null;
}

export interface ExistingAppointment {
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  status: 'booked' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
}

export interface AppointmentTypeSpec {
  id: string;
  durationMinutes: number;
  bufferMinutes: number;
}

export interface BookingPolicy {
  minNoticeMinutes: number;
  maxAdvanceDays: number;
}

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  minNoticeMinutes: 120,
  maxAdvanceDays: 60,
};

export interface Slot {
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface SlotQuery {
  doctorId: string;
  timezone: string;
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  appointments: ExistingAppointment[];
  appointmentType: AppointmentTypeSpec;
  /** search range (inclusive start, exclusive end), clinic-local dates "YYYY-MM-DD" */
  fromDate: string;
  toDate: string;
  policy?: BookingPolicy;
  /** injectable clock for tests */
  now?: Date;
}
