'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { VERTICALS } from '@clinical-crm/core';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug'),
  timezone: z.string().trim().min(1).max(64),
  vertical: z.enum(Object.keys(VERTICALS) as [string, ...string[]]),
});

export async function createClinicAction(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const parsed = schema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    timezone: formData.get('timezone'),
    vertical: formData.get('vertical'),
  });
  if (!parsed.success) {
    return { error: 'Please check the form — ' + parsed.error.issues[0]?.message };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_clinic', {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_timezone: parsed.data.timezone,
    p_vertical: parsed.data.vertical,
  });

  if (error) {
    if (error.code === '23505') {
      return { error: 'That URL slug is already taken. Adjust the name and try again.' };
    }
    return { error: error.message };
  }

  const clinic = data as { slug: string };
  redirect(`/${clinic.slug}/settings/doctors`);
}
