'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  computeOpenSlots,
  zonedToUtc,
  DEFAULT_BOOKING_POLICY,
  type AvailabilityRule,
  type AvailabilityException,
  type ExistingAppointment,
} from '@clinical-crm/core';
import { createClient } from '@/lib/supabase/server';
import { addDays, hhmm } from '@/lib/datetime';
import type { AgentConfig, Clinic } from '@/lib/types';

// ---------------------------------------------------------------------------

async function requireClinic(slug: string): Promise<{ clinic: Clinic; userId: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: clinic } = await supabase.from('clinics').select('*').eq('slug', slug).maybeSingle();
  if (!clinic) throw new Error('Clinic not found');
  return { clinic: clinic as Clinic, userId: user.id };
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---------------------------------------------------------------------------
// Open slots

const slotsSchema = z.object({
  slug: z.string(),
  doctorId: z.string().uuid(),
  appointmentTypeId: z.string().uuid(),
  date: dateStr,
});

export interface SlotDto {
  startsAt: string;
  endsAt: string;
}

export async function getOpenSlots(input: z.infer<typeof slotsSchema>): Promise<{ slots?: SlotDto[]; error?: string }> {
  const parsed = slotsSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input' };
  const { slug, doctorId, appointmentTypeId, date } = parsed.data;

  try {
    const { clinic } = await requireClinic(slug);
    const supabase = createClient();
    const tz = clinic.timezone;

    // widen the appointment window by a day on each side (tz safety)
    const windowStart = zonedToUtc(addDays(date, -1), '00:00', tz).toISOString();
    const windowEnd = zonedToUtc(addDays(date, 2), '00:00', tz).toISOString();

    const [typeRes, rulesRes, excRes, apptsRes, cfgRes] = await Promise.all([
      supabase.from('appointment_types').select('*').eq('id', appointmentTypeId).eq('clinic_id', clinic.id).maybeSingle(),
      supabase.from('availability_rules').select('*').eq('clinic_id', clinic.id).eq('doctor_id', doctorId),
      supabase.from('availability_exceptions').select('*').eq('clinic_id', clinic.id).eq('doctor_id', doctorId).eq('date', date),
      supabase
        .from('appointments')
        .select('doctor_id, starts_at, ends_at, status')
        .eq('clinic_id', clinic.id)
        .eq('doctor_id', doctorId)
        .in('status', ['booked', 'confirmed'])
        .gte('starts_at', windowStart)
        .lt('starts_at', windowEnd),
      supabase.from('agent_configs').select('booking_policy').eq('clinic_id', clinic.id).maybeSingle(),
    ]);

    if (!typeRes.data) return { error: 'Appointment type not found' };

    const rules: AvailabilityRule[] = (rulesRes.data ?? []).map((r) => ({
      doctorId: r.doctor_id,
      weekday: r.weekday,
      startTime: hhmm(r.start_time),
      endTime: hhmm(r.end_time),
    }));
    const exceptions: AvailabilityException[] = (excRes.data ?? []).map((e) => ({
      doctorId: e.doctor_id,
      date: e.date,
      kind: e.kind,
      startTime: e.start_time ? hhmm(e.start_time) : null,
      endTime: e.end_time ? hhmm(e.end_time) : null,
    }));
    const appointments: ExistingAppointment[] = (apptsRes.data ?? []).map((a) => ({
      doctorId: a.doctor_id,
      startsAt: new Date(a.starts_at),
      endsAt: new Date(a.ends_at),
      status: a.status,
    }));

    const bp = (cfgRes.data?.booking_policy ?? {}) as AgentConfig['booking_policy'];

    const slots = computeOpenSlots({
      doctorId,
      timezone: tz,
      rules,
      exceptions,
      appointments,
      appointmentType: {
        id: typeRes.data.id,
        durationMinutes: typeRes.data.duration_minutes,
        bufferMinutes: typeRes.data.buffer_minutes,
      },
      fromDate: date,
      toDate: date,
      policy: {
        minNoticeMinutes: bp.min_notice_minutes ?? DEFAULT_BOOKING_POLICY.minNoticeMinutes,
        maxAdvanceDays: bp.max_advance_days ?? DEFAULT_BOOKING_POLICY.maxAdvanceDays,
      },
    });

    return {
      slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to compute slots' };
  }
}

// ---------------------------------------------------------------------------
// Patient search / inline create

export interface PatientDto {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
}

export async function searchPatients(slug: string, query: string): Promise<{ patients?: PatientDto[]; error?: string }> {
  const q = String(query ?? '').trim();
  if (q.length < 1) return { patients: [] };
  try {
    const { clinic } = await requireClinic(slug);
    const supabase = createClient();
    const safe = q.replace(/[%_,()]/g, ' ').trim();
    const { data, error } = await supabase
      .from('patients')
      .select('id, first_name, last_name, phone')
      .eq('clinic_id', clinic.id)
      .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
      .order('last_name')
      .limit(10);
    if (error) return { error: error.message };
    return { patients: data as PatientDto[] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Search failed' };
  }
}

const inlinePatientSchema = z.object({
  slug: z.string(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Phone must be E.164, e.g. +15551234567'),
});

export async function createPatientInline(
  input: z.infer<typeof inlinePatientSchema>
): Promise<{ patient?: PatientDto; error?: string }> {
  const parsed = inlinePatientSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const { clinic } = await requireClinic(parsed.data.slug);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('patients')
      .insert({
        clinic_id: clinic.id,
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        phone: parsed.data.phone,
      })
      .select('id, first_name, last_name, phone')
      .single();
    if (error) {
      if (error.code === '23505') return { error: 'A patient with this phone number already exists.' };
      return { error: error.message };
    }
    return { patient: data as PatientDto };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create patient' };
  }
}

// ---------------------------------------------------------------------------
// Book / cancel / reschedule

const bookSchema = z.object({
  slug: z.string(),
  doctorId: z.string().uuid(),
  patientId: z.string().uuid(),
  appointmentTypeId: z.string().uuid(),
  startsAt: z.string().datetime(),
});

export async function bookAppointment(input: z.infer<typeof bookSchema>): Promise<{ ok?: boolean; error?: string }> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input' };
  const { slug, doctorId, patientId, appointmentTypeId, startsAt } = parsed.data;

  try {
    const { clinic, userId } = await requireClinic(slug);
    const supabase = createClient();

    const { data: type } = await supabase
      .from('appointment_types')
      .select('duration_minutes')
      .eq('id', appointmentTypeId)
      .eq('clinic_id', clinic.id)
      .maybeSingle();
    if (!type) return { error: 'Appointment type not found' };

    const start = new Date(startsAt);
    const end = new Date(start.getTime() + type.duration_minutes * 60_000);

    const { error } = await supabase.from('appointments').insert({
      clinic_id: clinic.id,
      doctor_id: doctorId,
      patient_id: patientId,
      appointment_type_id: appointmentTypeId,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: 'booked',
      source: 'dashboard',
      created_by_user: userId,
    });

    if (error) {
      if (error.code === '23P01') {
        return { error: 'That slot was just taken. Please pick another time.' };
      }
      return { error: error.message };
    }

    revalidatePath(`/${slug}/schedule`);
    revalidatePath(`/${slug}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Booking failed' };
  }
}

const cancelSchema = z.object({
  slug: z.string(),
  appointmentId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export async function cancelAppointment(input: z.infer<typeof cancelSchema>): Promise<{ ok?: boolean; error?: string }> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input' };
  try {
    const { clinic } = await requireClinic(parsed.data.slug);
    const supabase = createClient();
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', cancellation_reason: parsed.data.reason || null })
      .eq('id', parsed.data.appointmentId)
      .eq('clinic_id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath(`/${parsed.data.slug}/schedule`);
    revalidatePath(`/${parsed.data.slug}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Cancel failed' };
  }
}

const rescheduleSchema = z.object({
  slug: z.string(),
  appointmentId: z.string().uuid(),
  newStartsAt: z.string().datetime(),
  reason: z.string().trim().max(500).optional(),
});

/** Cancel + rebook. If the new insert hits the exclusion constraint, the original is restored. */
export async function rescheduleAppointment(
  input: z.infer<typeof rescheduleSchema>
): Promise<{ ok?: boolean; error?: string }> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input' };
  const { slug, appointmentId, newStartsAt, reason } = parsed.data;

  try {
    const { clinic, userId } = await requireClinic(slug);
    const supabase = createClient();

    const { data: appt } = await supabase
      .from('appointments')
      .select('*, appointment_types(duration_minutes)')
      .eq('id', appointmentId)
      .eq('clinic_id', clinic.id)
      .maybeSingle();
    if (!appt) return { error: 'Appointment not found' };
    if (appt.status === 'cancelled') return { error: 'Appointment is already cancelled' };

    const durationMs =
      appt.appointment_types?.duration_minutes != null
        ? appt.appointment_types.duration_minutes * 60_000
        : new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime();

    const prevStatus = appt.status;
    const start = new Date(newStartsAt);
    const end = new Date(start.getTime() + durationMs);

    // 1. cancel the original (frees the doctor's time range for the new insert)
    const { error: cancelError } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', cancellation_reason: reason || 'Rescheduled' })
      .eq('id', appointmentId);
    if (cancelError) return { error: cancelError.message };

    // 2. insert the replacement
    const { error: insertError } = await supabase.from('appointments').insert({
      clinic_id: clinic.id,
      doctor_id: appt.doctor_id,
      patient_id: appt.patient_id,
      appointment_type_id: appt.appointment_type_id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: 'booked',
      source: 'dashboard',
      created_by_user: userId,
      notes: appt.notes,
    });

    if (insertError) {
      // restore the original appointment
      await supabase
        .from('appointments')
        .update({ status: prevStatus, cancellation_reason: null })
        .eq('id', appointmentId);
      if (insertError.code === '23P01') {
        return { error: 'The new slot was just taken. The original appointment is unchanged.' };
      }
      return { error: insertError.message };
    }

    revalidatePath(`/${slug}/schedule`);
    revalidatePath(`/${slug}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Reschedule failed' };
  }
}
