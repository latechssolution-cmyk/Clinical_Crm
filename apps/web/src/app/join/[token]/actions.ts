'use server';

// The ONLY file in this app that touches the service-role key.
// Needed because RLS (correctly) prevents a not-yet-member from reading an
// invitation row; possession of the (unguessable uuid) token is the authorization.

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const tokenSchema = z.string().uuid();

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export interface InvitePreview {
  ok: boolean;
  reason?: 'invalid' | 'expired' | 'accepted';
  clinicName?: string;
  clinicSlug?: string;
  role?: string;
  email?: string;
}

export async function getInvitePreview(token: string): Promise<InvitePreview> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, reason: 'invalid' };

  const { data: invite } = await admin()
    .from('invitations')
    .select('id, clinic_id, email, role, expires_at, accepted_at, clinics(name, slug)')
    .eq('token', parsed.data)
    .maybeSingle();

  if (!invite) return { ok: false, reason: 'invalid' };
  if (invite.accepted_at) return { ok: false, reason: 'accepted' };
  if (new Date(invite.expires_at) < new Date()) return { ok: false, reason: 'expired' };

  const clinic = Array.isArray(invite.clinics) ? invite.clinics[0] : invite.clinics;
  return {
    ok: true,
    clinicName: clinic?.name,
    clinicSlug: clinic?.slug,
    role: invite.role,
    email: invite.email,
  };
}

export async function acceptInvitation(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const parsed = tokenSchema.safeParse(formData.get('token'));
  if (!parsed.success) return { error: 'Invalid invitation token.' };
  const token = parsed.data;

  // Identity always comes from the user's own session — never from the form.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/join/${token}`);

  const svc = admin();
  const { data: invite } = await svc
    .from('invitations')
    .select('id, clinic_id, role, expires_at, accepted_at, clinics(slug)')
    .eq('token', token)
    .maybeSingle();

  if (!invite) return { error: 'This invitation does not exist.' };
  if (invite.accepted_at) return { error: 'This invitation was already used.' };
  if (new Date(invite.expires_at) < new Date()) return { error: 'This invitation has expired.' };

  const { error: memberError } = await svc.from('clinic_members').insert({
    clinic_id: invite.clinic_id,
    user_id: user.id,
    role: invite.role,
  });

  // 23505 = already a member; treat as success.
  if (memberError && memberError.code !== '23505') {
    return { error: 'Could not join the clinic: ' + memberError.message };
  }

  await svc
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  const clinic = Array.isArray(invite.clinics) ? invite.clinics[0] : invite.clinics;
  redirect(`/${clinic?.slug ?? ''}`);
}
