import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getVertical } from '@clinical-crm/core';
import { createClient } from '@/lib/supabase/server';
import { getIsPlatformAdmin } from '@/lib/platform-admin';
import type { Clinic, MemberRole } from '@/lib/types';

/**
 * Resolve a clinic by slug through RLS (only members can see the row) and the
 * current user's role in it. Redirects if unauthenticated or not a member.
 * Cached per request so layout + page share one query.
 */
export const getClinic = cache(async (slug: string) => {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: clinic } = await supabase
    .from('clinics')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!clinic) redirect('/onboarding');

  const { data: membership } = await supabase
    .from('clinic_members')
    .select('role')
    .eq('clinic_id', clinic.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) redirect('/onboarding');

  // Suspension applies to the dashboard too, not just the phone line —
  // platform admins keep access so they can inspect/reactivate.
  if ((clinic as Clinic).status === 'suspended' && !(await getIsPlatformAdmin())) {
    redirect('/suspended');
  }

  return {
    clinic: clinic as Clinic,
    role: membership.role as MemberRole,
    user,
    /** the tenant's vertical pack (terminology, qualification fields, ...) */
    vertical: getVertical((clinic as Clinic).vertical),
  };
});
