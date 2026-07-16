// Hand-written row types matching supabase/migrations/20260716000001_init.sql

export type MemberRole = 'owner' | 'doctor' | 'staff';
export type AppointmentStatus = 'booked' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentSource = 'ai_call' | 'dashboard' | 'api';
export type CallOutcome =
  | 'booked'
  | 'cancelled'
  | 'rescheduled'
  | 'info'
  | 'voicemail'
  | 'spam'
  | 'escalated'
  | 'incomplete';

export interface BusinessDay {
  open: string; // "HH:MM"
  close: string;
  closed?: boolean;
}

/** keys "0".."6" (0 = Sunday) */
export type BusinessHours = Record<string, BusinessDay>;

export interface Clinic {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  address: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  business_hours: BusinessHours;
  settings: Record<string, unknown>;
  status: 'onboarding' | 'active' | 'suspended';
  vertical: string;
  default_country: string;
  created_at?: string;
}

export interface ClinicMember {
  id: string;
  clinic_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface Invitation {
  id: string;
  clinic_id: string;
  email: string;
  role: MemberRole;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface Doctor {
  id: string;
  clinic_id: string;
  user_id: string | null;
  name: string;
  specialty: string | null;
  bio: string | null;
  active: boolean;
}

export interface AppointmentType {
  id: string;
  clinic_id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  bookable_by_ai: boolean;
  active: boolean;
}

export interface AvailabilityRuleRow {
  id: string;
  clinic_id: string;
  doctor_id: string;
  weekday: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;
}

export interface AvailabilityExceptionRow {
  id: string;
  clinic_id: string;
  doctor_id: string;
  date: string; // "YYYY-MM-DD"
  kind: 'blocked' | 'extra';
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
}

export interface Patient {
  id: string;
  clinic_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  date_of_birth: string | null;
  address: string | null;
  qualification: Record<string, unknown>;
  notes: string | null;
  flags: { verified?: boolean; blocked?: boolean };
  created_at: string;
}

export interface Appointment {
  id: string;
  clinic_id: string;
  doctor_id: string;
  patient_id: string;
  appointment_type_id: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  created_by_user: string | null;
  created_by_call: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  // joined
  doctors?: Pick<Doctor, 'id' | 'name'> | null;
  patients?: Pick<Patient, 'id' | 'first_name' | 'last_name' | 'phone'> | null;
  appointment_types?: Pick<AppointmentType, 'id' | 'name'> | null;
}

export interface Call {
  id: string;
  clinic_id: string;
  provider_call_id: string | null;
  direction: 'inbound' | 'outbound';
  from_number: string | null;
  to_number: string | null;
  patient_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  status: 'in_progress' | 'completed' | 'failed' | 'rejected';
  recording_url: string | null;
  spam_score: number | null;
  spam_reasons: unknown[];
  // joined
  patients?: Pick<Patient, 'id' | 'first_name' | 'last_name'> | null;
  call_transcripts?: CallTranscript | CallTranscript[] | null;
}

export interface TranscriptTurn {
  role: string;
  text: string;
  at?: string;
}

export interface CallTranscript {
  id: string;
  clinic_id: string;
  call_id: string;
  turns: TranscriptTurn[];
  summary: string | null;
  outcome: CallOutcome | null;
  extracted_data: Record<string, unknown>;
  qualification: Record<string, unknown>;
}

export interface AgentConfig {
  id: string;
  clinic_id: string;
  greeting: string | null;
  voice: string;
  language: string;
  custom_instructions: string | null;
  faq: { q: string; a: string }[];
  booking_policy: {
    min_notice_minutes?: number;
    max_advance_days?: number;
    max_active_appointments_per_patient?: number;
    required_patient_fields?: string[];
  };
  escalation_number: string | null;
  after_hours_behavior: 'full_service' | 'message' | 'announce_only';
  recording_enabled: boolean;
  enabled: boolean;
}

export interface PhoneNumberRow {
  id: string;
  clinic_id: string;
  integration_id: string | null;
  number: string;
  provider: string;
  is_primary: boolean;
}
