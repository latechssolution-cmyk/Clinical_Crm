'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { Clinic, MemberRole } from '@/lib/types';

type Result = { ok?: boolean; error?: string };

async function requireClinic(slug: string): Promise<{ clinic: Clinic; role: MemberRole; userId: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: clinic } = await supabase.from('clinics').select('*').eq('slug', slug).maybeSingle();
  if (!clinic) throw new Error('Clinic not found');
  const { data: member } = await supabase
    .from('clinic_members')
    .select('role')
    .eq('clinic_id', clinic.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!member) throw new Error('Not a member of this clinic');
  return { clinic: clinic as Clinic, role: member.role as MemberRole, userId: user.id };
}

function fail(e: unknown): Result {
  return { error: e instanceof Error ? e.message : 'Something went wrong' };
}

const timeRe = /^\d{2}:\d{2}$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const phoneRe = /^\+[1-9]\d{6,14}$/;

// ---------------------------------------------------------------------------
// General

const businessDaySchema = z.object({
  open: z.string().regex(timeRe),
  close: z.string().regex(timeRe),
  closed: z.boolean().optional(),
});

const generalSchema = z.object({
  slug: z.string(),
  name: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(1).max(64),
  address: z.string().trim().max(300).nullable(),
  contact_phone: z.string().trim().max(30).nullable(),
  contact_email: z.string().trim().email().max(200).nullable().or(z.literal('').transform(() => null)),
  business_hours: z.record(z.string().regex(/^[0-6]$/), businessDaySchema),
});

export async function updateClinicGeneral(input: z.infer<typeof generalSchema>): Promise<Result> {
  const parsed = generalSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const { clinic } = await requireClinic(parsed.data.slug);
    const supabase = createClient();
    const { error } = await supabase
      .from('clinics')
      .update({
        name: parsed.data.name,
        timezone: parsed.data.timezone,
        address: parsed.data.address || null,
        contact_phone: parsed.data.contact_phone || null,
        contact_email: parsed.data.contact_email || null,
        business_hours: parsed.data.business_hours,
      })
      .eq('id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath(`/${parsed.data.slug}/settings`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Doctors

const doctorSchema = z.object({
  slug: z.string(),
  name: z.string().trim().min(2).max(120),
  specialty: z.string().trim().max(120).optional().or(z.literal('')),
});

export async function createDoctor(input: z.infer<typeof doctorSchema>): Promise<Result> {
  const parsed = doctorSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const { clinic } = await requireClinic(parsed.data.slug);
    const supabase = createClient();
    const { error } = await supabase.from('doctors').insert({
      clinic_id: clinic.id,
      name: parsed.data.name,
      specialty: parsed.data.specialty || null,
    });
    if (error) return { error: error.message };
    revalidatePath(`/${parsed.data.slug}/settings/doctors`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const doctorUpdateSchema = z.object({
  slug: z.string(),
  doctorId: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  specialty: z.string().trim().max(120).nullable().optional(),
  active: z.boolean().optional(),
});

export async function updateDoctor(input: z.infer<typeof doctorUpdateSchema>): Promise<Result> {
  const parsed = doctorUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const { clinic } = await requireClinic(parsed.data.slug);
    const supabase = createClient();
    const { slug, doctorId, ...fields } = parsed.data;
    const { error } = await supabase.from('doctors').update(fields).eq('id', doctorId).eq('clinic_id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath(`/${slug}/settings/doctors`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDoctor(slug: string, doctorId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(doctorId).success) return { error: 'Invalid doctor' };
  try {
    const { clinic } = await requireClinic(slug);
    const supabase = createClient();
    const { error } = await supabase.from('doctors').delete().eq('id', doctorId).eq('clinic_id', clinic.id);
    if (error) {
      if (error.code === '23503')
        return { error: 'This doctor has appointments. Deactivate them instead of deleting.' };
      return { error: error.message };
    }
    revalidatePath(`/${slug}/settings/doctors`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const ruleSchema = z.object({
  slug: z.string(),
  doctorId: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(timeRe),
  endTime: z.string().regex(timeRe),
});

export async function addAvailabilityRule(input: z.infer<typeof ruleSchema>): Promise<Result> {
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  if (parsed.data.startTime >= parsed.data.endTime) return { error: 'Start time must be before end time' };
  try {
    const { clinic } = await requireClinic(parsed.data.slug);
    const supabase = createClient();
    const { error } = await supabase.from('availability_rules').insert({
      clinic_id: clinic.id,
      doctor_id: parsed.data.doctorId,
      weekday: parsed.data.weekday,
      start_time: parsed.data.startTime,
      end_time: parsed.data.endTime,
    });
    if (error) return { error: error.message };
    revalidatePath(`/${parsed.data.slug}/settings/doctors`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAvailabilityRule(slug: string, ruleId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(ruleId).success) return { error: 'Invalid rule' };
  try {
    const { clinic } = await requireClinic(slug);
    const supabase = createClient();
    const { error } = await supabase.from('availability_rules').delete().eq('id', ruleId).eq('clinic_id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath(`/${slug}/settings/doctors`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const exceptionSchema = z.object({
  slug: z.string(),
  doctorId: z.string().uuid(),
  date: z.string().regex(dateRe),
  kind: z.enum(['blocked', 'extra']),
  startTime: z.string().regex(timeRe).nullable(),
  endTime: z.string().regex(timeRe).nullable(),
  reason: z.string().trim().max(300).optional().or(z.literal('')),
});

export async function addAvailabilityException(input: z.infer<typeof exceptionSchema>): Promise<Result> {
  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;
  if (d.kind === 'extra' && (!d.startTime || !d.endTime))
    return { error: 'Extra availability needs start and end times' };
  if (d.startTime && d.endTime && d.startTime >= d.endTime)
    return { error: 'Start time must be before end time' };
  try {
    const { clinic } = await requireClinic(d.slug);
    const supabase = createClient();
    const { error } = await supabase.from('availability_exceptions').insert({
      clinic_id: clinic.id,
      doctor_id: d.doctorId,
      date: d.date,
      kind: d.kind,
      start_time: d.startTime,
      end_time: d.endTime,
      reason: d.reason || null,
    });
    if (error) return { error: error.message };
    revalidatePath(`/${d.slug}/settings/doctors`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAvailabilityException(slug: string, exceptionId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(exceptionId).success) return { error: 'Invalid exception' };
  try {
    const { clinic } = await requireClinic(slug);
    const supabase = createClient();
    const { error } = await supabase
      .from('availability_exceptions')
      .delete()
      .eq('id', exceptionId)
      .eq('clinic_id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath(`/${slug}/settings/doctors`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Appointment types

const typeSchema = z.object({
  slug: z.string(),
  name: z.string().trim().min(2).max(120),
  durationMinutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(120),
  bookableByAi: z.boolean(),
});

export async function createAppointmentType(input: z.infer<typeof typeSchema>): Promise<Result> {
  const parsed = typeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const { clinic } = await requireClinic(parsed.data.slug);
    const supabase = createClient();
    const { error } = await supabase.from('appointment_types').insert({
      clinic_id: clinic.id,
      name: parsed.data.name,
      duration_minutes: parsed.data.durationMinutes,
      buffer_minutes: parsed.data.bufferMinutes,
      bookable_by_ai: parsed.data.bookableByAi,
    });
    if (error) return { error: error.message };
    revalidatePath(`/${parsed.data.slug}/settings/appointment-types`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const typeUpdateSchema = typeSchema.partial().extend({
  slug: z.string(),
  typeId: z.string().uuid(),
  active: z.boolean().optional(),
});

export async function updateAppointmentType(input: z.infer<typeof typeUpdateSchema>): Promise<Result> {
  const parsed = typeUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const { clinic } = await requireClinic(parsed.data.slug);
    const supabase = createClient();
    const d = parsed.data;
    const fields: Record<string, unknown> = {};
    if (d.name !== undefined) fields.name = d.name;
    if (d.durationMinutes !== undefined) fields.duration_minutes = d.durationMinutes;
    if (d.bufferMinutes !== undefined) fields.buffer_minutes = d.bufferMinutes;
    if (d.bookableByAi !== undefined) fields.bookable_by_ai = d.bookableByAi;
    if (d.active !== undefined) fields.active = d.active;
    const { error } = await supabase.from('appointment_types').update(fields).eq('id', d.typeId).eq('clinic_id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath(`/${d.slug}/settings/appointment-types`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAppointmentType(slug: string, typeId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(typeId).success) return { error: 'Invalid type' };
  try {
    const { clinic } = await requireClinic(slug);
    const supabase = createClient();
    const { error } = await supabase.from('appointment_types').delete().eq('id', typeId).eq('clinic_id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath(`/${slug}/settings/appointment-types`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// AI receptionist

const agentSchema = z.object({
  slug: z.string(),
  greeting: z.string().trim().max(1000).nullable(),
  voice: z.enum(['alloy', 'echo', 'shimmer', 'coral', 'sage']),
  language: z.string().trim().min(2).max(10),
  custom_instructions: z.string().trim().max(8000).nullable(),
  faq: z.array(z.object({ q: z.string().trim().min(1).max(500), a: z.string().trim().min(1).max(2000) })).max(50),
  escalation_number: z.string().trim().regex(phoneRe).nullable().or(z.literal('').transform(() => null)),
  after_hours_behavior: z.enum(['full_service', 'message', 'announce_only']),
  enabled: z.boolean(),
});

export async function updateAgentConfig(input: z.infer<typeof agentSchema>): Promise<Result> {
  const parsed = agentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const { clinic, role } = await requireClinic(parsed.data.slug);
    if (role !== 'owner') return { error: 'Only clinic owners can change AI settings' };
    const supabase = createClient();
    const { slug, ...fields } = parsed.data;
    const { error } = await supabase
      .from('agent_configs')
      .update({
        greeting: fields.greeting || null,
        voice: fields.voice,
        language: fields.language,
        custom_instructions: fields.custom_instructions || null,
        faq: fields.faq,
        escalation_number: fields.escalation_number,
        after_hours_behavior: fields.after_hours_behavior,
        enabled: fields.enabled,
      })
      .eq('clinic_id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath(`/${slug}/settings/ai`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Team

const inviteSchema = z.object({
  slug: z.string(),
  email: z.string().trim().email().max(200),
  role: z.enum(['owner', 'doctor', 'staff']),
});

export async function inviteMember(input: z.infer<typeof inviteSchema>): Promise<Result & { token?: string }> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const { clinic, role } = await requireClinic(parsed.data.slug);
    if (role !== 'owner') return { error: 'Only clinic owners can invite members' };
    const supabase = createClient();
    const { data, error } = await supabase
      .from('invitations')
      .insert({ clinic_id: clinic.id, email: parsed.data.email, role: parsed.data.role })
      .select('token')
      .single();
    if (error) return { error: error.message };
    revalidatePath(`/${parsed.data.slug}/settings/team`);
    return { ok: true, token: data.token };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeInvitation(slug: string, invitationId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(invitationId).success) return { error: 'Invalid invitation' };
  try {
    const { clinic } = await requireClinic(slug);
    const supabase = createClient();
    const { error } = await supabase.from('invitations').delete().eq('id', invitationId).eq('clinic_id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath(`/${slug}/settings/team`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeMember(slug: string, memberId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(memberId).success) return { error: 'Invalid member' };
  try {
    const { clinic, userId } = await requireClinic(slug);
    const supabase = createClient();
    const { data: member } = await supabase
      .from('clinic_members')
      .select('user_id')
      .eq('id', memberId)
      .eq('clinic_id', clinic.id)
      .maybeSingle();
    if (!member) return { error: 'Member not found' };
    if (member.user_id === userId) return { error: 'You cannot remove yourself.' };
    const { error } = await supabase.from('clinic_members').delete().eq('id', memberId).eq('clinic_id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath(`/${slug}/settings/team`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Phone numbers

const phoneSchema = z.object({
  slug: z.string(),
  number: z.string().trim().regex(phoneRe, 'Number must be E.164, e.g. +15551234567'),
  isPrimary: z.boolean(),
});

export async function addPhoneNumber(input: z.infer<typeof phoneSchema>): Promise<Result> {
  const parsed = phoneSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const { clinic, role } = await requireClinic(parsed.data.slug);
    if (role !== 'owner') return { error: 'Only clinic owners can manage phone numbers' };
    const supabase = createClient();
    const { error } = await supabase.from('phone_numbers').insert({
      clinic_id: clinic.id,
      number: parsed.data.number,
      is_primary: parsed.data.isPrimary,
    });
    if (error) {
      if (error.code === '23505') return { error: 'This number is already registered on the platform.' };
      return { error: error.message };
    }
    revalidatePath(`/${parsed.data.slug}/settings/phone`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
