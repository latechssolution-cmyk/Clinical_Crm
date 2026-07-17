import { getClinic } from '@/lib/get-clinic';
import { createClient } from '@/lib/supabase/server';
import type { AppointmentType } from '@/lib/types';
import { TypesClient } from './types-client';

export const dynamic = 'force-dynamic';

export default async function AppointmentTypesPage({ params }: { params: { slug: string } }) {
  const { clinic, role, vertical } = await getClinic(params.slug);
  const supabase = createClient();

  const { data } = await supabase
    .from('appointment_types')
    .select('*')
    .eq('clinic_id', clinic.id)
    .order('name');

  return (
    <TypesClient
      slug={clinic.slug}
      bookingLabel={vertical.terminology.booking}
      canEdit={role === 'owner' || role === 'staff'}
      types={(data ?? []) as AppointmentType[]}
    />
  );
}
