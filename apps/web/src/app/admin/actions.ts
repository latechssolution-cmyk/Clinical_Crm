'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/platform-admin';

const CreateTenantSchema = z.object({
  name: z.string().min(2).max(120),
  vertical: z.enum(['clinic', 'roofing']),
  timezone: z.string().min(1),
  country: z.string().length(2).default('US'),
});

function slugify(name: string): string {
  return (
    name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) +
    '-' +
    Math.random().toString(36).slice(2, 6)
  );
}

export async function createTenant(formData: FormData) {
  await requirePlatformAdmin();
  const supabase = createClient();

  const parsed = CreateTenantSchema.safeParse({
    name: formData.get('name'),
    vertical: formData.get('vertical'),
    timezone: formData.get('timezone'),
    country: formData.get('country') || 'US',
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid input');

  const { data: clinic, error } = await supabase.rpc('create_clinic', {
    p_name: parsed.data.name,
    p_slug: slugify(parsed.data.name),
    p_timezone: parsed.data.timezone,
    p_vertical: parsed.data.vertical,
  });
  if (error) throw new Error(error.message);

  // Set default country for phone normalization.
  await supabase.from('clinics').update({ default_country: parsed.data.country }).eq('id', clinic.id);

  revalidatePath('/admin');
  redirect(`/${clinic.slug}/settings`);
}

const JoinSchema = z.object({ clinicId: z.string().uuid(), role: z.enum(['owner', 'staff']).default('owner') });

/** Admin adds themselves as a member of any tenant (allowed by admin_members_insert RLS). */
export async function joinTenantAsOwner(formData: FormData) {
  await requirePlatformAdmin();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const parsed = JoinSchema.safeParse({
    clinicId: formData.get('clinicId'),
    role: formData.get('role') ?? 'owner',
  });
  if (!parsed.success || !user) throw new Error('invalid input');

  await supabase
    .from('clinic_members')
    .upsert(
      { clinic_id: parsed.data.clinicId, user_id: user.id, role: parsed.data.role },
      { onConflict: 'clinic_id,user_id' },
    );

  const { data: clinic } = await supabase
    .from('clinics')
    .select('slug')
    .eq('id', parsed.data.clinicId)
    .single();

  if (clinic) redirect(`/${clinic.slug}`);
  revalidatePath('/admin');
}

const SuspendSchema = z.object({
  clinicId: z.string().uuid(),
  status: z.enum(['active', 'suspended', 'onboarding']),
});

export async function setTenantStatus(formData: FormData) {
  await requirePlatformAdmin();
  const supabase = createClient();

  const parsed = SuspendSchema.safeParse({
    clinicId: formData.get('clinicId'),
    status: formData.get('status'),
  });
  if (!parsed.success) throw new Error('invalid input');

  const { error } = await supabase
    .from('clinics')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.clinicId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin');
}

const AssignNumberSchema = z.object({
  phoneId: z.string().uuid(),
  clinicId: z.string().uuid(),
});

/**
 * The tenant-routing switch: retarget an existing phone number to a different
 * tenant. Applies to the very next inbound call — no service restart needed.
 */
export async function assignNumber(formData: FormData) {
  await requirePlatformAdmin();
  const supabase = createClient();

  const parsed = AssignNumberSchema.safeParse({
    phoneId: formData.get('phoneId'),
    clinicId: formData.get('clinicId'),
  });
  if (!parsed.success) throw new Error('invalid input');

  const { error } = await supabase
    .from('phone_numbers')
    .update({ clinic_id: parsed.data.clinicId })
    .eq('id', parsed.data.phoneId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/numbers');
  revalidatePath('/admin');
}
