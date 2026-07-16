import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClinic } from '@/lib/get-clinic';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime, fmtDuration } from '@/lib/datetime';
import { Card, EmptyState, OutcomeBadge, StatusBadge } from '@/components/ui';
import type { Appointment, Call, CallTranscript, Patient } from '@/lib/types';
import { BlockedToggle, NotesEditor } from './patient-controls';

export const dynamic = 'force-dynamic';

export default async function PatientDetailPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const { clinic } = await getClinic(params.slug);
  const supabase = createClient();
  const tz = clinic.timezone;

  const { data: patientRow } = await supabase
    .from('patients')
    .select('*')
    .eq('clinic_id', clinic.id)
    .eq('id', params.id)
    .maybeSingle();

  if (!patientRow) notFound();
  const patient = patientRow as Patient;

  const [apptsRes, callsRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('*, doctors(id, name), appointment_types(id, name)')
      .eq('clinic_id', clinic.id)
      .eq('patient_id', patient.id)
      .order('starts_at', { ascending: false })
      .limit(50),
    supabase
      .from('calls')
      .select('*, call_transcripts(outcome, summary)')
      .eq('clinic_id', clinic.id)
      .eq('patient_id', patient.id)
      .order('started_at', { ascending: false })
      .limit(50),
  ]);

  const appointments = (apptsRes.data ?? []) as Appointment[];
  const calls = (callsRes.data ?? []) as Call[];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/${clinic.slug}/patients`} className="text-xs font-medium text-teal-600 hover:underline">
          ← Patients
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-900">
            {patient.first_name} {patient.last_name}
          </h1>
          {patient.flags?.blocked && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">blocked</span>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6">
          <Card title="Patient info">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Phone</dt><dd className="tabular-nums text-slate-800">{patient.phone}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Email</dt><dd className="text-slate-800">{patient.email ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Date of birth</dt><dd className="text-slate-800">{patient.date_of_birth ?? '—'}</dd></div>
            </dl>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <BlockedToggle slug={clinic.slug} patientId={patient.id} blocked={!!patient.flags?.blocked} />
            </div>
          </Card>
          <Card title="Notes">
            <NotesEditor slug={clinic.slug} patientId={patient.id} initialNotes={patient.notes ?? ''} />
          </Card>
        </div>

        <Card title="Appointment history">
          {appointments.length === 0 ? (
            <EmptyState>No appointments yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {appointments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{fmtDateTime(a.starts_at, tz)}</p>
                    <p className="text-xs text-slate-400">
                      {a.doctors?.name} · {a.appointment_types?.name ?? 'Appointment'}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Call history">
          {calls.length === 0 ? (
            <EmptyState>No calls linked to this patient.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {calls.map((c) => {
                const t = (Array.isArray(c.call_transcripts) ? c.call_transcripts[0] : c.call_transcripts) as
                  | CallTranscript
                  | null;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/${clinic.slug}/calls/${c.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{fmtDateTime(c.started_at, tz)}</p>
                        <p className="text-xs text-slate-400">{fmtDuration(c.duration_seconds)}</p>
                      </div>
                      <OutcomeBadge outcome={t?.outcome} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
