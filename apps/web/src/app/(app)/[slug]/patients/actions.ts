'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { normalizePhone } from '@clinical-crm/core';
import { createClient } from '@/lib/supabase/server';
import { requireClinic as requireClinicShared } from '@/lib/require-clinic';
import type { Clinic } from '@/lib/types';

async function requireClinic(slug: string): Promise<Clinic> {
  const { clinic } = await requireClinicShared(slug);
  return clinic;
}

const createSchema = z.object({
  slug: z.string(),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(1, 'Phone is required').max(30),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  address: z.string().trim().max(400).optional().or(z.literal('')),
  notes: z.string().trim().max(4000).optional().or(z.literal('')),
});

export async function createPatient(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const parsed = createSchema.safeParse({
    slug: formData.get('slug'),
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    phone: formData.get('phone'),
    email: formData.get('email') ?? '',
    date_of_birth: formData.get('date_of_birth') ?? '',
    address: formData.get('address') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  let clinic: Clinic;
  try {
    clinic = await requireClinic(parsed.data.slug);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unauthorized' };
  }

  const norm = normalizePhone(parsed.data.phone, clinic.default_country || 'US');
  if (!norm.ok || !norm.e164) {
    return { error: 'Enter a valid phone number, e.g. (555) 123-4567 or +15551234567.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('patients')
    .insert({
      clinic_id: clinic.id,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      phone: norm.e164,
      email: parsed.data.email || null,
      date_of_birth: parsed.data.date_of_birth || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'A patient with this phone number already exists.' };
    return { error: error.message };
  }

  revalidatePath(`/${parsed.data.slug}/patients`);
  redirect(`/${parsed.data.slug}/patients/${data.id}`);
}

const updateSchema = z.object({
  slug: z.string(),
  patientId: z.string().uuid(),
  first_name: z.string().trim().min(1).max(80).optional(),
  last_name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().min(1).max(30).optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  address: z.string().trim().max(400).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export async function updatePatient(input: z.infer<typeof updateSchema>): Promise<{ ok?: boolean; error?: string }> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    const clinic = await requireClinic(parsed.data.slug);
    const supabase = createClient();
    const { slug, patientId, ...fields } = parsed.data;
    if (fields.phone !== undefined) {
      const norm = normalizePhone(fields.phone, clinic.default_country || 'US');
      if (!norm.ok || !norm.e164) {
        return { error: 'Enter a valid phone number, e.g. (555) 123-4567 or +15551234567.' };
      }
      fields.phone = norm.e164;
    }
    const { error } = await supabase
      .from('patients')
      .update(fields)
      .eq('id', patientId)
      .eq('clinic_id', clinic.id);
    if (error) {
      if (error.code === '23505') return { error: 'Another patient already uses that phone number.' };
      return { error: error.message };
    }
    revalidatePath(`/${slug}/patients/${patientId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Update failed' };
  }
}

export async function setPatientBlocked(
  slug: string,
  patientId: string,
  blocked: boolean
): Promise<{ ok?: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(patientId).success) return { error: 'Invalid patient' };
  try {
    const clinic = await requireClinic(slug);
    const supabase = createClient();
    const { data: patient } = await supabase
      .from('patients')
      .select('flags')
      .eq('id', patientId)
      .eq('clinic_id', clinic.id)
      .maybeSingle();
    if (!patient) return { error: 'Patient not found' };
    const flags = { ...(patient.flags ?? {}), blocked };
    const { error } = await supabase.from('patients').update({ flags }).eq('id', patientId).eq('clinic_id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath(`/${slug}/patients/${patientId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Update failed' };
  }
}
