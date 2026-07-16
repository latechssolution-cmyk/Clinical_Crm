import { getClinic } from '@/lib/get-clinic';
import { createClient } from '@/lib/supabase/server';
import type { AvailabilityExceptionRow, AvailabilityRuleRow, Doctor } from '@/lib/types';
import { DoctorsClient } from './doctors-client';

export const dynamic = 'force-dynamic';

export default async function DoctorsSettingsPage({ params }: { params: { slug: string } }) {
  const { clinic, role } = await getClinic(params.slug);
  const supabase = createClient();

  const [doctorsRes, rulesRes, excRes] = await Promise.all([
    supabase.from('doctors').select('*').eq('clinic_id', clinic.id).order('name'),
    supabase.from('availability_rules').select('*').eq('clinic_id', clinic.id).order('weekday').order('start_time'),
    supabase.from('availability_exceptions').select('*').eq('clinic_id', clinic.id).order('date'),
  ]);

  return (
    <DoctorsClient
      slug={clinic.slug}
      canEdit={role === 'owner' || role === 'staff'}
      doctors={(doctorsRes.data ?? []) as Doctor[]}
      rules={(rulesRes.data ?? []) as AvailabilityRuleRow[]}
      exceptions={(excRes.data ?? []) as AvailabilityExceptionRow[]}
    />
  );
}
