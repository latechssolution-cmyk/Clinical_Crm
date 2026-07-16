import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClinic } from '@/lib/get-clinic';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime, fmtDuration, fmtTime } from '@/lib/datetime';
import { Card, EmptyState, OutcomeBadge, SpamBadge, StatusBadge } from '@/components/ui';
import type { Appointment, Call, CallTranscript } from '@/lib/types';
import { MarkSpamButton } from './mark-spam';

export const dynamic = 'force-dynamic';

export default async function CallDetailPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const { clinic } = await getClinic(params.slug);
  const supabase = createClient();
  const tz = clinic.timezone;

  const { data: callRow } = await supabase
    .from('calls')
    .select('*, patients(id, first_name, last_name)')
    .eq('clinic_id', clinic.id)
    .eq('id', params.id)
    .maybeSingle();

  if (!callRow) notFound();
  const call = callRow as Call;

  const [transcriptRes, apptRes] = await Promise.all([
    supabase.from('call_transcripts').select('*').eq('call_id', call.id).maybeSingle(),
    supabase
      .from('appointments')
      .select('*, doctors(id, name), appointment_types(id, name)')
      .eq('clinic_id', clinic.id)
      .eq('created_by_call', call.id)
      .order('starts_at'),
  ]);

  const transcript = transcriptRes.data as CallTranscript | null;
  const linkedAppointments = (apptRes.data ?? []) as Appointment[];
  const isSpam = call.spam_score != null && call.spam_score > 0.7;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/${clinic.slug}/calls`} className="text-xs font-medium text-teal-600 hover:underline">
          ← Calls
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-900">
            Call from {call.from_number ?? 'unknown number'}
          </h1>
          <OutcomeBadge outcome={transcript?.outcome} />
          {isSpam && <SpamBadge />}
        </div>
        <p className="text-sm text-slate-500">
          {fmtDateTime(call.started_at, tz)} · {fmtDuration(call.duration_seconds)} · {call.status}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {transcript?.summary && (
            <Card title="Summary">
              <p className="text-sm leading-relaxed text-slate-700">{transcript.summary}</p>
            </Card>
          )}

          <Card title="Transcript">
            {!transcript || transcript.turns.length === 0 ? (
              <EmptyState>No transcript available for this call.</EmptyState>
            ) : (
              <div className="space-y-3">
                {transcript.turns.map((turn, i) => {
                  const isAgent = turn.role === 'assistant' || turn.role === 'agent' || turn.role === 'ai';
                  return (
                    <div key={i} className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                          isAgent
                            ? 'rounded-tl-sm bg-slate-100 text-slate-800'
                            : 'rounded-tr-sm bg-teal-600 text-white'
                        }`}
                      >
                        <p className={`mb-0.5 text-[11px] font-medium ${isAgent ? 'text-slate-400' : 'text-teal-100'}`}>
                          {isAgent ? 'AI receptionist' : 'Caller'}
                          {turn.at && ` · ${fmtTime(turn.at, tz)}`}
                        </p>
                        {turn.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Linked patient">
            {call.patients ? (
              <Link
                href={`/${clinic.slug}/patients/${call.patients.id}`}
                className="text-sm font-medium text-teal-700 hover:underline"
              >
                {call.patients.first_name} {call.patients.last_name}
              </Link>
            ) : (
              <p className="text-sm text-slate-400">No patient matched to this call.</p>
            )}
          </Card>

          <Card title="Linked appointments">
            {linkedAppointments.length === 0 ? (
              <p className="text-sm text-slate-400">No appointments were created from this call.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {linkedAppointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2">
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

          {call.recording_url && (
            <Card title="Recording">
              <audio controls src={call.recording_url} className="w-full" />
            </Card>
          )}

          <Card title="Spam">
            <MarkSpamButton
              slug={clinic.slug}
              callId={call.id}
              hasFromNumber={!!call.from_number}
              alreadySpam={call.spam_score === 1}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
