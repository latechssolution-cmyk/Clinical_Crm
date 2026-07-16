import { z } from 'zod';
import { computeOpenSlots } from '@clinical-crm/core';
import type {
  AvailabilityException,
  AvailabilityRule,
  ExistingAppointment,
} from '@clinical-crm/core';
import { getSupabase } from '../db.js';
import { describeBusinessHours } from '../hours.js';
import type { CallSession } from '../session.js';

type ToolResult = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const uuid = z.string().uuid();

function normalizePhone(raw: string, fallbackRegionDigits?: string): string | null {
  const cleaned = raw.replace(/[\s().-]/g, '');
  if (/^\+\d{7,15}$/.test(cleaned)) return cleaned;
  if (/^00\d{7,15}$/.test(cleaned)) return `+${cleaned.slice(2)}`;
  if (/^\d{7,15}$/.test(cleaned)) {
    // Bare national number: borrow the country code from the caller ID if we
    // have one, else assume it is already a full number missing "+".
    if (fallbackRegionDigits && /^\+1\d{10}$/.test(fallbackRegionDigits) && cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    return `+${cleaned}`;
  }
  return null;
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

  const phone = args.phone ? normalizePhone(args.phone, session.fromNumber) : null;
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
    return { success: false, reason: 'provide at least a phone, name, or date of birth' };
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
  email: z.string().email().optional(),
});

async function createPatient(session: CallSession, raw: unknown): Promise<ToolResult> {
  const args = createPatientArgs.parse(raw);
  const clinicId = session.tenant.clinicId;
  const policy = session.tenant.bookingPolicy;

  const phone = normalizePhone(args.phone ?? session.fromNumber, session.fromNumber);
  const record: Record<string, unknown> = {
    clinic_id: clinicId,
    first_name: args.first_name.trim(),
    last_name: args.last_name.trim(),
    phone,
    date_of_birth: args.date_of_birth ?? null,
    email: args.email ?? null,
  };

  const missing = policy.required_patient_fields.filter((f) => !record[f]);
  if (missing.length > 0) {
    return { success: false, reason: `missing required fields: ${missing.join(', ')} — collect them from the caller` };
  }
  if (!phone) return { success: false, reason: 'a valid phone number is required' };

  const db = getSupabase();
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
          reason: 'a patient with this phone number already exists',
          existing_patient: {
            patient_id: existing.data.id,
            name: `${existing.data.first_name} ${existing.data.last_name}`,
            date_of_birth: existing.data.date_of_birth,
          },
        };
      }
    }
    return { success: false, reason: 'could not create patient record' };
  }
  session.patientId = data.id as string;
  return { success: true, patient_id: data.id, name: `${data.first_name} ${data.last_name}` };
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
  if (!apptType) return { success: false, reason: 'unknown appointment type' };
  if (!apptType.bookable_by_ai) {
    return { success: false, reason: 'this appointment type must be booked by clinic staff — offer to take a message' };
  }

  const doctors = args.doctor_id
    ? tenant.doctors.filter((d) => d.id === args.doctor_id)
    : tenant.doctors;
  if (doctors.length === 0) return { success: false, reason: 'unknown doctor' };

  // Clamp the search window to something sane for a phone call.
  let { from_date, to_date } = args;
  if (to_date < from_date) to_date = from_date;
  const spanDays = (Date.parse(to_date) - Date.parse(from_date)) / 86_400_000;
  if (spanDays > 14) {
    to_date = new Date(Date.parse(from_date) + 14 * 86_400_000).toISOString().slice(0, 10);
  }

  const doctorIds = doctors.map((d) => d.id);
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
      .gte('date', from_date)
      .lte('date', to_date),
    db
      .from('appointments')
      .select('doctor_id, starts_at, ends_at, status')
      .eq('clinic_id', tenant.clinicId)
      .in('doctor_id', doctorIds)
      .in('status', ['booked', 'confirmed'])
      // over-fetch one day either side; computeOpenSlots handles exact overlap
      .gte('starts_at', new Date(Date.parse(from_date) - 86_400_000).toISOString())
      .lte('starts_at', new Date(Date.parse(to_date) + 2 * 86_400_000).toISOString()),
  ]);
  if (rulesRes.error || excRes.error || apptsRes.error) {
    return { success: false, reason: 'could not load availability' };
  }

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

  const all = doctors.flatMap((d) =>
    computeOpenSlots({
      doctorId: d.id,
      timezone: tenant.clinic.timezone,
      rules,
      exceptions,
      appointments,
      appointmentType: {
        id: apptType.id,
        durationMinutes: apptType.duration_minutes,
        bufferMinutes: apptType.buffer_minutes,
      },
      fromDate: from_date,
      toDate: to_date,
      policy,
    }),
  );

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
  if (!apptType) return { success: false, reason: 'unknown appointment type' };
  if (!apptType.bookable_by_ai) return { success: false, reason: 'this appointment type cannot be booked by phone' };
  if (!tenant.doctors.some((d) => d.id === args.doctor_id)) {
    return { success: false, reason: 'unknown doctor' };
  }

  // Verify the patient belongs to THIS clinic.
  const patient = await db
    .from('patients')
    .select('id, first_name, last_name')
    .eq('clinic_id', tenant.clinicId)
    .eq('id', args.patient_id)
    .maybeSingle();
  if (patient.error || !patient.data) return { success: false, reason: 'unknown patient' };

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
      reason: `this patient already has ${activeCount.count} upcoming appointments (limit ${maxActive}) — offer to reschedule or cancel one instead`,
    };
  }

  const startsAt = new Date(args.starts_at);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now()) {
    return { success: false, reason: 'invalid or past start time' };
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
  if (appt.error || !appt.data) return { success: false, reason: 'appointment not found' };
  if (session.patientId && appt.data.patient_id !== session.patientId) {
    return { success: false, reason: 'this appointment belongs to a different patient' };
  }
  if (appt.data.status === 'cancelled') return { success: false, reason: 'already cancelled' };

  const { error } = await db
    .from('appointments')
    .update({ status: 'cancelled', cancellation_reason: args.reason ?? 'cancelled by patient via AI call' })
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
  if (appt.error || !appt.data) return { success: false, reason: 'appointment not found' };
  if (session.patientId && appt.data.patient_id !== session.patientId) {
    return { success: false, reason: 'this appointment belongs to a different patient' };
  }
  if (appt.data.status !== 'booked' && appt.data.status !== 'confirmed') {
    return { success: false, reason: `appointment is ${appt.data.status}, not active` };
  }

  const newStart = new Date(args.new_starts_at);
  if (Number.isNaN(newStart.getTime()) || newStart.getTime() < Date.now()) {
    return { success: false, reason: 'invalid or past start time' };
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
      return { success: false, reason: 'slot_taken', message: 'that time is not available — the original appointment is unchanged; offer alternatives' };
    }
    return { success: false, reason: 'reschedule failed — the original appointment is unchanged' };
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
    return { success: false, reason: 'reschedule failed — the original appointment is unchanged' };
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
  if (patient.error || !patient.data) return { success: false, reason: 'unknown patient' };

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
      doctor: doctorName.get(a.doctor_id) ?? 'unknown doctor',
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
      await logToolEvent(session, name, argsJson, 'invalid JSON args');
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
  await logToolEvent(session, name, args, summary);
  return result;
}
