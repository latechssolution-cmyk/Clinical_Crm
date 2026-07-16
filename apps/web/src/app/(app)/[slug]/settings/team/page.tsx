import { getClinic } from '@/lib/get-clinic';
import { createClient } from '@/lib/supabase/server';
import type { ClinicMember, Invitation } from '@/lib/types';
import { TeamClient } from './team-client';

export const dynamic = 'force-dynamic';

export default async function TeamSettingsPage({ params }: { params: { slug: string } }) {
  const { clinic, role, user } = await getClinic(params.slug);
  const supabase = createClient();

  const [membersRes, invitesRes] = await Promise.all([
    supabase.from('clinic_members').select('*').eq('clinic_id', clinic.id).order('created_at'),
    // RLS: only owners can read invitations — harmless empty result otherwise
    supabase
      .from('invitations')
      .select('*')
      .eq('clinic_id', clinic.id)
      .is('accepted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  return (
    <TeamClient
      slug={clinic.slug}
      isOwner={role === 'owner'}
      currentUserId={user.id}
      currentUserEmail={user.email ?? ''}
      members={(membersRes.data ?? []) as ClinicMember[]}
      invitations={(invitesRes.data ?? []) as Invitation[]}
    />
  );
}
