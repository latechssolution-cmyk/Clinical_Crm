import { createClient } from '@/lib/supabase/server';
import type { Clinic, MemberRole } from '@/lib/types';

/**
 * Server-action tenant gate: authenticated + clinic exists + caller is a
 * member + tenant not suspended. Every mutating action must pass through this
 * — clinic-row visibility alone stopped proving membership once platform
 * admins gained cross-tenant SELECT.
 */
export async function requireClinic(
  slug: string,
): Promise<{ clinic: Clinic; role: MemberRole; userId: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: clinic } = await supabase.from('clinics').select('*').eq('slug', slug).maybeSingle();
  if (!clinic) throw new Error('Workspace not found');
  const { data: member } = await supabase
    .from('clinic_members')
    .select('role')
    .eq('clinic_id', clinic.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!member) throw new Error('Not a member of this workspace');
  if ((clinic as Clinic).status === 'suspended') throw new Error('This workspace is suspended');
  return { clinic: clinic as Clinic, role: member.role as MemberRole, userId: user.id };
}
