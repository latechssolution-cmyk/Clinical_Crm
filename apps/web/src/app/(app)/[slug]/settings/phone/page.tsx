import { getClinic } from '@/lib/get-clinic';
import { createClient } from '@/lib/supabase/server';
import type { PhoneNumberRow } from '@/lib/types';
import { PhoneClient } from './phone-client';

export const dynamic = 'force-dynamic';

export default async function PhoneSettingsPage({ params }: { params: { slug: string } }) {
  const { clinic, role } = await getClinic(params.slug);
  const supabase = createClient();

  const { data } = await supabase
    .from('phone_numbers')
    .select('*')
    .eq('clinic_id', clinic.id)
    .order('created_at');

  return (
    <PhoneClient
      slug={clinic.slug}
      isOwner={role === 'owner'}
      numbers={(data ?? []) as PhoneNumberRow[]}
    />
  );
}
