import { z } from 'zod';
import { getSupabase } from './db.js';

// ---------------------------------------------------------------------------
// Row shapes (subset of the live schema in supabase/migrations)
// ---------------------------------------------------------------------------

export interface ClinicRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  address: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  business_hours: Record<string, unknown>;
  settings: Record<string, unknown>;
  status: 'onboarding' | 'active' | 'suspended';
}

export interface AgentConfigRow {
  id: string;
  clinic_id: string;
  greeting: string | null;
  voice: string;
  language: string;
  custom_instructions: string | null;
  faq: Array<{ q?: string; a?: string }>;
  booking_policy: Record<string, unknown>;
  escalation_number: string | null;
  after_hours_behavior: 'full_service' | 'message' | 'announce_only';
  recording_enabled: boolean;
  enabled: boolean;
}

export interface DoctorRow {
  id: string;
  clinic_id: string;
  name: string;
  specialty: string | null;
  active: boolean;
}

export interface AppointmentTypeRow {
  id: string;
  clinic_id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  bookable_by_ai: boolean;
  active: boolean;
}

const bookingPolicySchema = z
  .object({
    min_notice_minutes: z.number().int().min(0).default(120),
    max_advance_days: z.number().int().min(1).default(60),
    max_active_appointments_per_patient: z.number().int().min(1).default(2),
    required_patient_fields: z
      .array(z.string())
      .default(['first_name', 'last_name', 'phone', 'date_of_birth']),
  })
  .passthrough();

export type BookingPolicy = z.infer<typeof bookingPolicySchema>;

/**
 * The tenant-isolation boundary. Every DB query made on behalf of a call goes
 * through this context: clinicId is resolved once, from the dialed phone
 * number, and pinned. The LLM never influences which clinic is queried.
 */
export interface TenantContext {
  clinicId: string;
  clinic: ClinicRow;
  agentConfig: AgentConfigRow;
  doctors: DoctorRow[];
  appointmentTypes: AppointmentTypeRow[];
  bookingPolicy: BookingPolicy;
}

function parseBookingPolicy(raw: unknown): BookingPolicy {
  const parsed = bookingPolicySchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  return bookingPolicySchema.parse({});
}

async function loadContext(clinicId: string): Promise<TenantContext | null> {
  const db = getSupabase();

  const [clinicRes, agentRes, doctorsRes, typesRes] = await Promise.all([
    db.from('clinics').select('*').eq('id', clinicId).maybeSingle(),
    db.from('agent_configs').select('*').eq('clinic_id', clinicId).maybeSingle(),
    db.from('doctors').select('*').eq('clinic_id', clinicId).eq('active', true).order('name'),
    db.from('appointment_types').select('*').eq('clinic_id', clinicId).eq('active', true).order('name'),
  ]);

  if (clinicRes.error || !clinicRes.data) {
    if (clinicRes.error) console.error('[tenant] clinic lookup failed:', clinicRes.error.message);
    return null;
  }
  if (agentRes.error) console.error('[tenant] agent_config lookup failed:', agentRes.error.message);
  if (doctorsRes.error) console.error('[tenant] doctors lookup failed:', doctorsRes.error.message);
  if (typesRes.error) console.error('[tenant] appointment_types lookup failed:', typesRes.error.message);

  const clinic = clinicRes.data as ClinicRow;

  // agent_configs is created by create_clinic(); fall back to schema defaults
  // if it is somehow missing so a misconfigured clinic still gets an answer.
  const agentConfig: AgentConfigRow =
    (agentRes.data as AgentConfigRow | null) ?? {
      id: '',
      clinic_id: clinicId,
      greeting: `Thank you for calling ${clinic.name}. How can I help you today?`,
      voice: 'alloy',
      language: 'en',
      custom_instructions: null,
      faq: [],
      booking_policy: {},
      escalation_number: null,
      after_hours_behavior: 'message',
      recording_enabled: false,
      enabled: true,
    };

  return {
    clinicId,
    clinic,
    agentConfig,
    doctors: (doctorsRes.data as DoctorRow[] | null) ?? [],
    appointmentTypes: (typesRes.data as AppointmentTypeRow[] | null) ?? [],
    bookingPolicy: parseBookingPolicy(agentConfig.booking_policy),
  };
}

/** Resolve the clinic that owns a dialed E.164 number. Null if unknown. */
export async function resolveTenantByNumber(dialedNumber: string): Promise<TenantContext | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from('phone_numbers')
    .select('clinic_id')
    .eq('number', dialedNumber)
    .maybeSingle();
  if (error) {
    console.error('[tenant] phone_numbers lookup failed:', error.message);
    return null;
  }
  if (!data) return null;
  return loadContext(data.clinic_id as string);
}

/** Re-load a tenant context by clinic id (used by the media-stream leg). */
export async function loadTenantByClinicId(clinicId: string): Promise<TenantContext | null> {
  if (!/^[0-9a-f-]{36}$/i.test(clinicId)) return null;
  return loadContext(clinicId);
}

/** True if `fromNumber` is on the clinic's blocked list. */
export async function isBlockedNumber(clinicId: string, fromNumber: string): Promise<boolean> {
  if (!fromNumber) return false;
  const db = getSupabase();
  const { data, error } = await db
    .from('blocked_numbers')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('number', fromNumber)
    .maybeSingle();
  if (error) {
    console.error('[tenant] blocked_numbers lookup failed:', error.message);
    return false;
  }
  return Boolean(data);
}
