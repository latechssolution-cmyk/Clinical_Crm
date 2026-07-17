import { z } from 'zod';
import { computeOpenSlots, normalizePhone, phoneTail } from '@clinical-crm/core';
import type {
  AvailabilityException,
  AvailabilityRule,
  ExistingAppointment,
} from '@clinical-crm/core';
import { getSupabase } from '../db.js';
import { describeBusinessHours } from '../hours.js';
import { sendBookingConfirmationSms } from '../sms.js';
import type { CallSession } from '../session.js';

type ToolResult = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const uuid = z.string().uuid();

/** Lower-cased vertical terminology for caller-facing tool-result strings. */
const T = (s: CallSession) => {
  const t = s.tenant.vertical.terminology;
  return {
    contact: t.contact.toLowerCase(), // "patient" | "lead"
    booking: t.booking.toLowerCase(), // "appointment" | "inspection"
    bookings: t.bookings.toLowerCase(),
    provider: t.provider.toLowerCase(), // "doctor" | "estimator"
  };
};

const INVALID_PHONE: ToolResult = {
  success: false,
  reason: 'invalid_phone',
  message:
    'read back the number you heard and ask the caller to confirm or correct it — only ask for digit-by-digit if it fails again',
};

/** Normalize a raw phone to E.164 using the tenant's default country. Null on failure. */
function tenantPhone(session: CallSession, raw: string): string | null {
  const result = normalizePhone(raw, session.tenant.clinic.default_country || 'US');
  return result.ok && result.e164 ? result.e164 : null;
}

function maskPhone(phone: string | null): string {
  if (!phone) return 'unknown';
  return `ends in ${phone.slice(-4)}`;
}

function spokenTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

async function logToolEvent(
  session: CallSession,
  name: string,
  args: unknown,
  resultSummary: string,
): Promise<void> {
  try {
    await getSupabase().from('call_events').insert({
      clinic_id: session.tenant.clinicId,
      call_id: session.callId,
      event_type: 'tool_call',
      payload: { name, args, result_summary: resultSummary },
    });
  } catch (err) {
    console.error(`[tools] failed to log call_event for ${name}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Tool implementations — every query pinned to session.tenant.clinicId
// ---------------------------------------------------------------------------

const findPatientArgs = z.object({
  phone: z.string().optional(),
  name: z.string().optional(),
  date_of_birth: isoDate.optional(),
});

async function findPatient(session: CallSession, raw: unknown): Promise<ToolResult> {
  const args = findPatientArgs.parse(raw);
  const db = getSupabase();
  const clinicId = session.tenant.clinicId;

  let query = db
    .from('patients')
    .select('id, first_name, last_name, phone, date_of_birth')
    .eq('clinic_id', clinicId)
    .limit(5);

  let phone: string | null = null;
  if (args.phone) {
    phone = tenantPhone(session, args.phone);
    if (!phone) return { ...INVALID_PHONE };
  }
  if (phone) {
    query = query.eq('phone', phone);
  } else if (args.name) {
    const term = args.name.replace(/[%,()]/g, '').trim();
    if (term.length >= 2) {
      query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
    }
  }
  if (args.date_of_birth) query = query.eq('date_of_birth', args.date_of_birth);
  if (!phone && !args.name && !args.date_of_birth) {
    const withDob = session.tenant.requiredContactFields.includes('date_of_birth');
    return { success: false, reason: `provide at least a phone${withDob ? ', name, or date of birth' : ' or name'}` };
  }

  const { data, error } = await query;
  if (error) return { success: false, reason: 'search failed' };

  const candidates = (data ?? []).map((p) => ({
    patient_id: p.id,
    name: `${p.first_name} ${p.last_name}`,
    phone: maskPhone(p.phone),
    date_of_birth: p.date_of_birth,
  }));
  return { success: true, candidates, count: candidates.length };
}

const createPatientArgs = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
  date_of_birth: isoDate.optional(),
  address: z.string().optional(),
  email: z.string().email().optional(),
  /** true only after the caller confirmed a similar existing record is not them */
  confirmed_not_duplicate: z.boolean().optional(),
});

async function createPatient(session: CallSession, raw: unknown): Promise<ToolResult> {
  const args = createPatientArgs.parse(raw);
  const clinicId = session.tenant.clinicId;

  const rawPhone = args.phone ?? session.fromNumber;
  const phone = rawPhone ? tenantPhone(session, rawPhone) : null;
  if (rawPhone && !phone) return { ...INVALID_PHONE };

  const record: Record<string, unknown> = {
    clinic_id: clinicId,
    first_name: args.first_name.trim(),
    last_name: args.last_name.trim(),
    phone,
    date_of_birth: args.date_of_birth ?? null,
    address: args.address?.trim() || null,
    email: args.email ?? null,
  };
  // Qualification collected earlier in the call lands on the new record too.
  if (Object.keys(session.qualification).length > 0) {
    record.qualification = session.qualification;
  }

  const missing = session.tenant.requiredContactFields.filter((f) => !record[f]);
  if (missing.length > 0) {
    return { success: false, reason: `missing required fields: ${missing.join(', ')} — collect them from the caller` };
  }
  if (!phone) return { success: false, reason: 'a valid phone number is required' };

  const db = getSupabase();

  // Fuzzy dedup: an existing record whose phone shares the same last-7 digits
  // is very likely the same person reached at a slightly different format.
  if (!args.confirmed_not_duplicate) {
    const tail = phoneTail(phone, 7);
    const dup = await db
      .from('patients')
      .select('id, first_name, last_name, phone')
      .eq('clinic_id', clinicId)
      .like('phone', `%${tail}`)
      .limit(1);
    const match = dup.data?.[0];
    if (!dup.error && match) {
      return {
        success: false,
        reason: 'possible_duplicate',
        existing: {
          id: match.id,
          name: `${match.first_name} ${match.last_name}`,
          phone_last4: String(match.phone ?? '').slice(-4),
        },
        message:
          'ask the caller: "I found an existing record for NAME with a number ending in XXXX — is that you?" If yes, call confirm_existing_patient; if no, call create_patient again with confirmed_not_duplicate: true',
      };
    }
  }
  const { data, error } = await db.from('patients').insert(record).select('id, first_name, last_name').single();
  if (error) {
    if (error.code === '23505') {
      // phone already registered at this clinic — return the existing record
      const existing = await db
        .from('patients')
        .select('id, first_name, last_name, date_of_birth')
        .eq('clinic_id', clinicId)
        .eq('phone', phone)
        .maybeSingle();
      if (existing.data) {
        return {
          success: false,
          reason: `a ${T(session).contact} with this phone number already exists`,
          existing_patient: {
            patient_id: existing.data.id,
            name: `${existing.data.first_name} ${existing.data.last_name}`,
            date_of_birth: existing.data.date_of_birth,
          },
        };
      }
    }
    return { success: false, reason: `could not create ${T(session).contact} record` };
  }
  session.patientId = data.id as string;
  return { success: true, patient_id: data.id, name: `${data.first_name} ${data.last_name}` };
}

const confirmExistingArgs = z.object({ patient_id: uuid });

/** The caller verbally confirmed an existing record is them — pin it to the session. */
async function confirmExistingPatient(session: CallSession, raw: unknown): Promise<ToolResult> {
  const args = confirmExistingArgs.parse(raw);
  const db = getSupabase();
  const { data, error } = await db
    .from('patients')
    .select('id, first_name, last_name')
    .eq('clinic_id', session.tenant.clinicId)
    .eq('id', args.patient_id)
    .maybeSingle();
  if (error || !data) return { success: false, reason: `unknown ${T(session).contact}` };

  session.patientId = data.id as string;

  // Flush any qualification collected before the caller was identified.
  if (Object.keys(session.qualification).length > 0) {
    await mergePatientQualification(session, data.id as string);
  }
  return { success: true, patient_id: data.id, name: `${data.first_name} ${data.last_name}` };
}

/** Merge session qualification into the patient row's jsonb (best-effort). */
async function mergePatientQualification(session: CallSession, patientId: string): Promise<void> {
  const db = getSupabase();
  const current = await db
    .from('patients')
    .select('qualification')
    .eq('clinic_id', session.tenant.clinicId)
    .eq('id', patientId)
    .maybeSingle();
  const existing =
    current.data && typeof current.data.qualification === 'object' && current.data.qualification !== null
      ? (current.data.qualification as Record<string, unknown>)
      : {};
  const { error } = await db
    .from('patients')
    .update({ qualification: { ...existing, ...session.qualification } })
    .eq('clinic_id', session.tenant.clinicId)
    .eq('id', patientId);
  if (error) console.error(`[call ${session.callId}] qualification merge failed:`, error.message);
}

async function saveQualification(session: CallSession, raw: unknown): Promise<ToolResult> {
  const qualFields = session.tenant.vertical.qualificationFields;
  if (qualFields.length === 0) {
    return { success: false, reason: 'qualification is not used for this business' };
  }

  // Build the validator from the vertical pack: unknown keys are rejected,
  // selects must match their options, booleans must be booleans.
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of qualFields) {
    shape[f.key] =
      f.type === 'boolean'
        ? z.boolean()
        : f.options && f.options.length > 0
          ? z.enum(f.options as [string, ...string[]])
          : z.string().min(1);
  }
  const args = z.object({ fields: z.object(shape).partial().strict() }).parse(raw);

  const provided = Object.fromEntries(
    Object.entries(args.fields).filter(([, v]) => v !== undefined && v !== null),
  );
  if (Object.keys(provided).length === 0) {
    return { success: false, reason: 'no qualification fields provided' };
  }

  session.qualification = { ...session.qualification, ...provided };
  if (session.patientId) await mergePatientQualification(session, session.patientId);

  const missingRequired = qualFields
    .filter((f) => f.required && session.qualification[f.key] === undefined)
    .map((f) => f.key);
  return {
    success: true,
    saved: Object.keys(provided),
    missing_required_before_booking: missingRequired,
  };
}

/** Clinic-local YYYY-MM-DD for an instant. */
function localDateStr(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

interface ApptTypeSpec {
  id: string;
  duration_minutes: number;
  buffer_minutes: number;
}

/**
 * Fetch rules/exceptions/appointments and compute open slots for a date range.
 * Null on load failure. Shared by slot offering AND write validation so the
 * two can never disagree.
 */
async function computeSlotsForRange(
  session: CallSession,
  apptType: ApptTypeSpec,
  doctorIds: string[],
  fromDate: string,
  toDate: string,
) {
  const { tenant } = session;
  const db = getSupabase();
  const [rulesRes, excRes, apptsRes] = await Promise.all([
    db
      .from('availability_rules')
      .select('doctor_id, weekday, start_time, end_time')
      .eq('clinic_id', tenant.clinicId)
      .in('doctor_id', doctorIds),
    db
      .from('availability_exceptions')
      .select('doctor_id, date, kind, start_time, end_time')
      .eq('clinic_id', tenant.clinicId)
      .in('doctor_id', doctorIds)
      .gte('date', fromDate)
      .lte('date', toDate),
    db
      .from('appointments')
      .select('doctor_id, starts_at, ends_at, status')
      .eq('clinic_id', tenant.clinicId)
      .in('doctor_id', doctorIds)
      .in('status', ['booked', 'confirmed'])
      // over-fetch one day either side; computeOpenSlots handles exact overlap
      .gte('starts_at', new Date(Date.parse(fromDate) - 86_400_000).toISOString())
      .lte('starts_at', new Date(Date.parse(toDate) + 2 * 86_400_000).toISOString()),
  ]);
  if (rulesRes.error || excRes.error || apptsRes.error) return null;

  const rules: AvailabilityRule[] = (rulesRes.data ?? []).map((r) => ({
    doctorId: r.doctor_id,
    weekday: r.weekday,
    startTime: String(r.start_time).slice(0, 5),
    endTime: String(r.end_time).slice(0, 5),
  }));
  const exceptions: AvailabilityException[] = (excRes.data ?? []).map((e) => ({
    doctorId: e.doctor_id,
    date: e.date,
    kind: e.kind as 'blocked' | 'extra',
    startTime: e.start_time ? String(e.start_time).slice(0, 5) : null,
    endTime: e.end_time ? String(e.end_time).slice(0, 5) : null,
  }));
  const appointments: ExistingAppointment[] = (apptsRes.data ?? []).map((a) => ({
    doctorId: a.doctor_id,
    startsAt: new Date(a.starts_at),
    endsAt: new Date(a.ends_at),
    status: a.status as ExistingAppointment['status'],
  }));

  const policy = {
    minNoticeMinutes: tenant.bookingPolicy.min_notice_minutes,
    maxAdvanceDays: tenant.bookingPolicy.max_advance_days,
  };

  return doctorIds.flatMap((doctorId) =>
    computeOpenSlots({
      doctorId,
      timezone: tenant.clinic.timezone,
      rules,
      exceptions,
      appointments,
      appointmentType: {
        id: apptType.id,
        durationMinutes: apptType.duration_minutes,
        bufferMinutes: apptType.buffer_minutes,
      },
      fromDate,
      toDate,
      policy,
    }),
  );
}

/**
 * A booked/rescheduled time must be exactly one of the slots the engine would
 * offer — otherwise an off-grid timestamp (hallucinated or stale) can land
 * inside another appointment's buffer or outside availability windows.
 */
async function isOfferedSlot(
  session: CallSession,
  apptType: ApptTypeSpec,
  doctorId: string,
  startsAt: Date,
): Promise<boolean | null> {
  const date = localDateStr(startsAt, session.tenant.clinic.timezone);
  const slots = await computeSlotsForRange(session, apptType, [doctorId], date, date);
  if (slots === null) return null;
  return slots.some((s) => s.startsAt.getTime() === startsAt.getTime());
}

const getSlotsArgs = z.object({
  doctor_id: uuid.optional(),
  appointment_type_id: uuid,
  from_date: isoDate,
  to_date: isoDate,
});

async function getAvailableSlots(session: CallSession, raw: unknown): Promise<ToolResult> {
  const args = getSlotsArgs.parse(raw);
  const { tenant } = session;
  const db = getSupabase();

  const apptType = tenant.appointmentTypes.find((t) => t.id === args.appointment_type_id);
  if (!apptType) return { success: false, reason: `unknown ${T(session).booking} type` };
  if (!apptType.bookable_by_ai) {
    return { success: false, reason: `this ${T(session).booking} type must be booked by staff — offer to take a message` };
  }

  const doctors = args.doctor_id
    ? tenant.doctors.filter((d) => d.id === args.doctor_id)
    : tenant.doctors;
  if (doctors.length === 0) return { success: false, reason: `unknown ${T(session).provider}` };

  // Clamp the search window to something sane for a phone call.
  let { from_date, to_date } = args;
  if (to_date < from_date) to_date = from_date;
  const spanDays = (Date.parse(to_date) - Date.parse(from_date)) / 86_400_000;
  if (spanDays > 14) {
    to_date = new Date(Date.parse(from_date) + 14 * 86_400_000).toISOString().slice(0, 10);
  }

  const all = await computeSlotsForRange(session, apptType, doctors.map((d) => d.id), from_date, to_date);
  if (all === null) return { success: false, reason: 'could not load availability' };

  all.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const doctorName = new Map(doctors.map((d) => [d.id, d.name]));
  const slots = all.slice(0, 10).map((s) => ({
    doctor_id: s.doctorId,
    doctor_name: doctorName.get(s.doctorId),
    starts_at: s.startsAt.toISOString(),
    spoken: `${spokenTime(s.startsAt.toISOString(), tenant.clinic.timezone)} with ${doctorName.get(s.doctorId)}`,
  }));

  return {
    success: true,
    slots,
    note: slots.length === 0 ? 'no open slots in this range — try other dates' : undefined,
  };
}

const bookArgs = z.object({
  patient_id: uuid,
  doctor_id: uuid,
  appointment_type_id: uuid,
  starts_at: z.string().datetime({ offset: true }),
});

async function bookAppointment(session: CallSession, raw: unknown): Promise<ToolResult> {
  const args = bookArgs.parse(raw);
  const { tenant } = session;
  const db = getSupabase();

  const apptType = tenant.appointmentTypes.find((t) => t.id === args.appointment_type_id);
  if (!apptType) return { success: false, reason: `unknown ${T(session).booking} type` };
  if (!apptType.bookable_by_ai) return { success: false, reason: `this ${T(session).booking} type cannot be booked by phone` };
  if (!tenant.doctors.some((d) => d.id === args.doctor_id)) {
    return { success: false, reason: `unknown ${T(session).provider}` };
  }

  // Vertical qualification gate: required fields must be saved before booking.
  const missingQual = tenant.vertical.qualificationFields
    .filter((f) => f.required && (session.qualification[f.key] === undefined || session.qualification[f.key] === ''))
    .map((f) => f.key);
  if (missingQual.length > 0) {
    return {
      success: false,
      reason: 'qualification_incomplete',
      missing: missingQual,
      message: 'collect these details from the caller and record them with save_qualification, then book again',
    };
  }

  // Verify the patient belongs to THIS clinic.
  const patient = await db
    .from('patients')
    .select('id, first_name, last_name, phone')
    .eq('clinic_id', tenant.clinicId)
    .eq('id', args.patient_id)
    .maybeSingle();
  if (patient.error || !patient.data) return { success: false, reason: `unknown ${T(session).contact}` };

  // Anti-blocking policy: cap active future appointments per patient.
  const maxActive = tenant.bookingPolicy.max_active_appointments_per_patient;
  const activeCount = await db
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', tenant.clinicId)
    .eq('patient_id', args.patient_id)
    .in('status', ['booked', 'confirmed'])
    .gte('starts_at', new Date().toISOString());
  if ((activeCount.count ?? 0) >= maxActive) {
    return {
      success: false,
      reason: `this ${T(session).contact} already has ${activeCount.count} upcoming ${T(session).bookings} (limit ${maxActive}) — offer to reschedule or cancel one instead`,
    };
  }

  const startsAt = new Date(args.starts_at);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now()) {
    return { success: false, reason: 'invalid or past start time' };
  }
  const offered = await isOfferedSlot(session, apptType, args.doctor_id, startsAt);
  if (offered === null) return { success: false, reason: 'could not verify availability — try again' };
  if (!offered) {
    return {
      success: false,
      reason: 'not_an_offered_slot',
      message: 'this exact time is not open — call get_available_slots and use one of the returned starts_at values verbatim',
    };
  }
  const endsAt = new Date(startsAt.getTime() + apptType.duration_minutes * 60_000);

  const { data, error } = await db
    .from('appointments')
    .insert({
      clinic_id: tenant.clinicId,
      doctor_id: args.doctor_id,
      patient_id: args.patient_id,
      appointment_type_id: args.appointment_type_id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'booked',
      source: 'ai_call',
      created_by_call: session.callId,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23P01') {
      return { success: false, reason: 'slot_taken', message: 'that time was just taken — offer alternatives from get_available_slots' };
    }
    console.error('[tools] book_appointment failed:', error.message);
    return { success: false, reason: 'booking failed' };
  }

  session.patientId = args.patient_id;

  // Fire-and-forget SMS confirmation — a failure must never break the booking.
  if (patient.data.phone) {
    sendBookingConfirmationSms(session, {
      to: String(patient.data.phone),
      spokenTime: spokenTime(startsAt.toISOString(), tenant.clinic.timezone),
    });
  }

  return {
    success: true,
    appointment_id: data.id,
    starts_at: startsAt.toISOString(),
    spoken: spokenTime(startsAt.toISOString(), tenant.clinic.timezone),
    patient_name: `${patient.data.first_name} ${patient.data.last_name}`,
  };
}

const cancelArgs = z.object({
  appointment_id: uuid,
  reason: z.string().optional(),
});

async function cancelAppointment(session: CallSession, raw: unknown): Promise<ToolResult> {
  const args = cancelArgs.parse(raw);
  const { tenant } = session;
  const db = getSupabase();

  const appt = await db
    .from('appointments')
    .select('id, patient_id, starts_at, status')
    .eq('clinic_id', tenant.clinicId)
    .eq('id', args.appointment_id)
    .maybeSingle();
  if (appt.error || !appt.data) return { success: false, reason: `${T(session).booking} not found` };
  // The caller must be identified before acting on any appointment — without
  // this, a social-engineered appointment_id could cancel anyone's booking.
  if (!session.patientId) {
    return { success: false, reason: 'identify the caller first (find_patient or create_patient) before cancelling' };
  }
  if (appt.data.patient_id !== session.patientId) {
    return { success: false, reason: `this ${T(session).booking} belongs to a different caller record` };
  }
  if (appt.data.status === 'cancelled') return { success: false, reason: 'already cancelled' };

  const { error } = await db
    .from('appointments')
    .update({ status: 'cancelled', cancellation_reason: args.reason ?? `cancelled by ${T(session).contact} via AI call` })
    .eq('clinic_id', tenant.clinicId)
    .eq('id', args.appointment_id);
  if (error) return { success: false, reason: 'cancellation failed' };

  return {
    success: true,
    cancelled: spokenTime(appt.data.starts_at, tenant.clinic.timezone),
  };
}

const rescheduleArgs = z.object({
  appointment_id: uuid,
  new_starts_at: z.string().datetime({ offset: true }),
});

async function rescheduleAppointment(session: CallSession, raw: unknown): Promise<ToolResult> {
  const args = rescheduleArgs.parse(raw);
  const { tenant } = session;
  const db = getSupabase();

  const appt = await db
    .from('appointments')
    .select('id, patient_id, doctor_id, appointment_type_id, starts_at, ends_at, status')
    .eq('clinic_id', tenant.clinicId)
    .eq('id', args.appointment_id)
    .maybeSingle();
  if (appt.error || !appt.data) return { success: false, reason: `${T(session).booking} not found` };
  if (!session.patientId) {
    return { success: false, reason: 'identify the caller first (find_patient or create_patient) before rescheduling' };
  }
  if (appt.data.patient_id !== session.patientId) {
    return { success: false, reason: `this ${T(session).booking} belongs to a different caller record` };
  }
  if (appt.data.status !== 'booked' && appt.data.status !== 'confirmed') {
    return { success: false, reason: `${T(session).booking} is ${appt.data.status}, not active` };
  }

  const newStart = new Date(args.new_starts_at);
  if (Number.isNaN(newStart.getTime()) || newStart.getTime() < Date.now()) {
    return { success: false, reason: 'invalid or past start time' };
  }
  const apptRow = appt.data;
  const apptTypeSpec = tenant.appointmentTypes.find((t) => t.id === apptRow.appointment_type_id);
  if (apptTypeSpec) {
    const offered = await isOfferedSlot(session, apptTypeSpec, apptRow.doctor_id, newStart);
    if (offered === null) return { success: false, reason: 'could not verify availability — try again' };
    if (!offered) {
      return {
        success: false,
        reason: 'not_an_offered_slot',
        message: 'this exact time is not open — call get_available_slots and use one of the returned starts_at values verbatim',
      };
    }
  }
  const durationMs = new Date(appt.data.ends_at).getTime() - new Date(appt.data.starts_at).getTime();
  const newEnd = new Date(newStart.getTime() + durationMs);

  // Insert the NEW appointment first: if the slot is taken the exclusion
  // constraint rejects it and the ORIGINAL appointment remains untouched.
  const inserted = await db
    .from('appointments')
    .insert({
      clinic_id: tenant.clinicId,
      doctor_id: appt.data.doctor_id,
      patient_id: appt.data.patient_id,
      appointment_type_id: appt.data.appointment_type_id,
      starts_at: newStart.toISOString(),
      ends_at: newEnd.toISOString(),
      status: 'booked',
      source: 'ai_call',
      created_by_call: session.callId,
      notes: `rescheduled from ${appt.data.starts_at}`,
    })
    .select('id')
    .single();
  if (inserted.error) {
    if (inserted.error.code === '23P01') {
      return { success: false, reason: 'slot_taken', message: `that time is not available — the original ${T(session).booking} is unchanged; offer alternatives` };
    }
    return { success: false, reason: `reschedule failed — the original ${T(session).booking} is unchanged` };
  }

  const cancelled = await db
    .from('appointments')
    .update({ status: 'cancelled', cancellation_reason: 'rescheduled via AI call' })
    .eq('clinic_id', tenant.clinicId)
    .eq('id', args.appointment_id);
  if (cancelled.error) {
    // Roll the new one back so we never leave the patient double-booked.
    await db.from('appointments').update({ status: 'cancelled', cancellation_reason: 'reschedule rollback' })
      .eq('clinic_id', tenant.clinicId).eq('id', inserted.data.id);
    return { success: false, reason: `reschedule failed — the original ${T(session).booking} is unchanged` };
  }

  return {
    success: true,
    appointment_id: inserted.data.id,
    new_time: spokenTime(newStart.toISOString(), tenant.clinic.timezone),
  };
}

const findApptsArgs = z.object({ patient_id: uuid });

async function findPatientAppointments(session: CallSession, raw: unknown): Promise<ToolResult> {
  const args = findApptsArgs.parse(raw);
  const { tenant } = session;
  const db = getSupabase();

  // Verify the patient belongs to this clinic before listing anything.
  const patient = await db
    .from('patients')
    .select('id')
    .eq('clinic_id', tenant.clinicId)
    .eq('id', args.patient_id)
    .maybeSingle();
  if (patient.error || !patient.data) return { success: false, reason: `unknown ${T(session).contact}` };

  const { data, error } = await db
    .from('appointments')
    .select('id, doctor_id, starts_at, status, appointment_type_id')
    .eq('clinic_id', tenant.clinicId)
    .eq('patient_id', args.patient_id)
    .in('status', ['booked', 'confirmed'])
    .gte('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(10);
  if (error) return { success: false, reason: 'lookup failed' };

  session.patientId = args.patient_id;
  const doctorName = new Map(tenant.doctors.map((d) => [d.id, d.name]));
  const typeName = new Map(tenant.appointmentTypes.map((t) => [t.id, t.name]));
  return {
    success: true,
    appointments: (data ?? []).map((a) => ({
      appointment_id: a.id,
      doctor: doctorName.get(a.doctor_id) ?? `unknown ${T(session).provider}`,
      type: a.appointment_type_id ? typeName.get(a.appointment_type_id) : undefined,
      status: a.status,
      spoken: spokenTime(a.starts_at, tenant.clinic.timezone),
      starts_at: a.starts_at,
    })),
  };
}

const clinicInfoArgs = z.object({ topic: z.string().optional() });

async function getClinicInfo(session: CallSession, raw: unknown): Promise<ToolResult> {
  clinicInfoArgs.parse(raw);
  const { clinic, agentConfig } = session.tenant;
  return {
    success: true,
    name: clinic.name,
    address: clinic.address,
    phone: clinic.contact_phone,
    hours: describeBusinessHours(clinic.business_hours) || 'not configured',
    faq: Array.isArray(agentConfig.faq) ? agentConfig.faq : [],
  };
}

const noteArgs = z.object({
  note: z.string().min(1),
  important: z.boolean().optional(),
});

async function saveCallNote(session: CallSession, raw: unknown): Promise<ToolResult> {
  const args = noteArgs.parse(raw);
  const { error } = await getSupabase().from('call_events').insert({
    clinic_id: session.tenant.clinicId,
    call_id: session.callId,
    event_type: 'note',
    payload: { note: args.note, important: args.important ?? false },
  });
  if (error) return { success: false, reason: 'could not save note' };
  return { success: true };
}

const spamArgs = z.object({ reason: z.string().min(1) });

async function flagSpam(session: CallSession, raw: unknown): Promise<ToolResult> {
  const args = spamArgs.parse(raw);
  const db = getSupabase();
  const current = await db
    .from('calls')
    .select('spam_reasons')
    .eq('clinic_id', session.tenant.clinicId)
    .eq('id', session.callId)
    .maybeSingle();
  const reasons: unknown[] = Array.isArray(current.data?.spam_reasons) ? current.data.spam_reasons : [];
  reasons.push(args.reason);
  const { error } = await db
    .from('calls')
    .update({ spam_score: 1, spam_reasons: reasons })
    .eq('clinic_id', session.tenant.clinicId)
    .eq('id', session.callId);
  if (error) return { success: false, reason: 'could not flag call' };
  session.flaggedSpam = true;
  return { success: true, next: 'politely end the call now with end_call' };
}

async function endCall(session: CallSession): Promise<ToolResult> {
  session.endRequested = true;
  return { success: true, next: 'say a brief goodbye — the call will disconnect after you finish speaking' };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const handlers: Record<string, (s: CallSession, args: unknown) => Promise<ToolResult>> = {
  find_patient: findPatient,
  create_patient: createPatient,
  confirm_existing_patient: confirmExistingPatient,
  save_qualification: saveQualification,
  get_available_slots: getAvailableSlots,
  book_appointment: bookAppointment,
  cancel_appointment: cancelAppointment,
  reschedule_appointment: rescheduleAppointment,
  find_patient_appointments: findPatientAppointments,
  get_clinic_info: getClinicInfo,
  save_call_note: saveCallNote,
  flag_spam: flagSpam,
  end_call: endCall,
};

/**
 * Execute a tool call from the model. Never throws: all failures come back as
 * { success: false, reason } so the agent can recover conversationally.
 */
export async function executeTool(
  session: CallSession,
  name: string,
  argsJson: string,
): Promise<ToolResult> {
  session.toolCallCount += 1;
  const handler = handlers[name];
  let args: unknown = {};
  let result: ToolResult;

  if (!handler) {
    result = { success: false, reason: `unknown tool: ${name}` };
  } else {
    try {
      args = argsJson ? JSON.parse(argsJson) : {};
    } catch {
      result = { success: false, reason: 'invalid tool arguments (not JSON)' };
      void logToolEvent(session, name, argsJson, 'invalid JSON args');
      return result;
    }
    try {
      result = await handler(session, args);
    } catch (err) {
      if (err instanceof z.ZodError) {
        result = {
          success: false,
          reason: `invalid arguments: ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        };
      } else {
        console.error(`[tools] ${name} threw:`, err);
        result = { success: false, reason: 'internal error executing tool' };
      }
    }
  }

  const summary = result.success === true ? 'ok' : String(result.reason ?? 'failed');
  console.log(`[call ${session.callId}] tool ${name} → ${summary}`);
  // Fire-and-forget: audit logging must not add a DB round-trip of dead air
  // to the caller's wait while the model regenerates speech.
  void logToolEvent(session, name, args, summary);
  return result;
}
