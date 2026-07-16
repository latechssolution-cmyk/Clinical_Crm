import { zonedToUtc } from '@clinical-crm/core';
import { getClinic } from '@/lib/get-clinic';
import { createClient } from '@/lib/supabase/server';
import { addDays, localDateStr, mondayOf } from '@/lib/datetime';
import type { Appointment, AppointmentType, Doctor } from '@/lib/types';
import { ScheduleClient } from './schedule-client';

export const dynamic = 'force-dynamic';

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { week?: string; doctor?: string };
}) {
  const { clinic } = await getClinic(params.slug);
  const supabase = createClient();
  const tz = clinic.timezone;

  const today = localDateStr(new Date(), tz);
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week ?? '') ? searchParams.week! : today;
  const weekStart = mondayOf(anchor);
  const rangeStart = zonedToUtc(weekStart, '00:00', tz).toISOString();
  const rangeEnd = zonedToUtc(addDays(weekStart, 7), '00:00', tz).toISOString();
  const doctorFilter = searchParams.doctor;

  let apptQuery = supabase
    .from('appointments')
    .select('*, doctors(id, name), patients(id, first_name, last_name, phone), appointment_types(id, name)')
    .eq('clinic_id', clinic.id)
    .gte('starts_at', rangeStart)
    .lt('starts_at', rangeEnd)
    .order('starts_at');
  if (doctorFilter) apptQuery = apptQuery.eq('doctor_id', doctorFilter);

  const [apptsRes, doctorsRes, typesRes] = await Promise.all([
    apptQuery,
    supabase.from('doctors').select('*').eq('clinic_id', clinic.id).order('name'),
    supabase.from('appointment_types').select('*').eq('clinic_id', clinic.id).eq('active', true).order('name'),
  ]);

  return (
    <ScheduleClient
      slug={clinic.slug}
      timezone={tz}
      today={today}
      weekStart={weekStart}
      doctorFilter={doctorFilter ?? ''}
      appointments={(apptsRes.data ?? []) as Appointment[]}
      doctors={(doctorsRes.data ?? []) as Doctor[]}
      appointmentTypes={(typesRes.data ?? []) as AppointmentType[]}
    />
  );
}
