import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClinic } from '@/lib/get-clinic';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime, fmtDuration, fmtTime } from '@/lib/datetime';
import { Card, EmptyState, OutcomeBadge, SpamBadge, StatusBadge } from '@/components/ui';
import { QualificationList, hasQualification } from '@/components/qualification';
import type { Appointment, Call, CallTranscript } from '@/lib/types';
import { MarkSpamButton } from './mark-spam';

interface ToolEvent {
  created_at: string;
  event_type: string;
  payload: { name?: string; args?: Record<string, unknown>; result_summary?: string };
}

/** Human-readable line for a logged agent action, in the tenant's terminology. */
function describeEvent(
  ev: ToolEvent,
  t: { contact: string; booking: string; bookings: string },
  tz: string,
): { label: string; detail?: string; failed: boolean } {
  const name = ev.payload?.name ?? 'action';
  const args = ev.payload?.args ?? {};
  const result = ev.payload?.result_summary ?? '';
  const failed = result !== 'ok';
  const contact = t.contact.toLowerCase();
  const booking = t.booking.toLowerCase();

  const argStr = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : undefined);
  const when = (k: string) => {
    const v = argStr(k);
    try { return v ? fmtDateTime(v, tz) : undefined; } catch { return undefined; }
  };

  switch (name) {
    case 'find_patient':
      return { label: `Looked up ${contact}`, detail: argStr('phone') ?? argStr('name'), failed };
    case 'create_patient':
      return {
        label: `Created new ${contact} record`,
        detail: [argStr('first_name'), argStr('last_name')].filter(Boolean).join(' ') || undefined,
        failed,
      };
    case 'confirm_existing_patient':
      return { label: `Matched existing ${contact} record`, failed };
    case 'save_qualification': {
      const fields = args.fields && typeof args.fields === 'object' ? Object.keys(args.fields as object) : [];
      return { label: 'Recorded qualification details', detail: fields.join(', ') || undefined, failed };
    }
    case 'get_available_slots':
      return { label: 'Checked availability', detail: argStr('from_date'), failed };
    case 'book_appointment':
      return { label: `Booked ${booking}`, detail: when('starts_at'), failed };
    case 'cancel_appointment':
      return { label: `Cancelled ${booking}`, detail: argStr('reason'), failed };
    case 'reschedule_appointment':
      return { label: `Rescheduled ${booking}`, detail: when('new_starts_at'), failed };
    case 'find_patient_appointments':
      return { label: `Listed ${contact}'s ${t.bookings.toLowerCase()}`, failed };
    case 'get_clinic_info':
      return { label: 'Shared business info', failed };
    case 'save_call_note':
      return { label: args.important ? 'Saved an important note' : 'Saved a note', failed };
    case 'flag_spam':
      return { label: 'Flagged call as spam', detail: argStr('reason'), failed: false };
    case 'end_call':
      return { label: 'Agent ended the call', failed: false };
    default:
      return { label: name.replace(/_/g, ' '), failed };
  }
}

export const dynamic = 'force-dynamic';

export default async function CallDetailPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const { clinic, vertical } = await getClinic(params.slug);
  const t = vertical.terminology;
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

  const [transcriptRes, apptRes, eventsRes] = await Promise.all([
    supabase.from('call_transcripts').select('*').eq('call_id', call.id).maybeSingle(),
    supabase
      .from('appointments')
      .select('*, doctors(id, name), appointment_types(id, name)')
      .eq('clinic_id', clinic.id)
      .eq('created_by_call', call.id)
      .order('starts_at'),
    supabase
      .from('call_events')
      .select('created_at, event_type, payload')
      .eq('clinic_id', clinic.id)
      .eq('call_id', call.id)
      .eq('event_type', 'tool_call')
      .order('created_at'),
  ]);

  const transcript = transcriptRes.data as CallTranscript | null;
  const linkedAppointments = (apptRes.data ?? []) as Appointment[];
  const events = (eventsRes.data ?? []) as ToolEvent[];
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
          <Card title="Activity">
            {events.length === 0 ? (
              <p className="text-sm text-slate-400">The AI took no actions on this call.</p>
            ) : (
              <ol className="space-y-2.5">
                {events.map((ev, i) => {
                  const d = describeEvent(ev, t, tz);
                  return (
                    <li key={i} className="flex gap-2.5 text-sm">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          d.failed ? 'bg-amber-400' : 'bg-teal-500'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-slate-800">
                          {d.label}
                          {d.detail && <span className="text-slate-500"> — {d.detail}</span>}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {fmtTime(ev.created_at, tz)}
                          {d.failed && ev.payload?.result_summary && ` · ${ev.payload.result_summary}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          {transcript && hasQualification(transcript.qualification) && (
            <Card title="Qualification">
              <QualificationList
                qualification={transcript.qualification}
                fields={vertical.qualificationFields}
              />
            </Card>
          )}

          <Card title={`Linked ${t.contact.toLowerCase()}`}>
            {call.patients ? (
              <Link
                href={`/${clinic.slug}/patients/${call.patients.id}`}
                className="text-sm font-medium text-teal-700 hover:underline"
              >
                {call.patients.first_name} {call.patients.last_name}
              </Link>
            ) : (
              <p className="text-sm text-slate-400">No {t.contact.toLowerCase()} matched to this call.</p>
            )}
          </Card>

          <Card title={`Linked ${t.bookings.toLowerCase()}`}>
            {linkedAppointments.length === 0 ? (
              <p className="text-sm text-slate-400">No {t.bookings.toLowerCase()} were created from this call.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {linkedAppointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{fmtDateTime(a.starts_at, tz)}</p>
                      <p className="text-xs text-slate-400">
                        {a.doctors?.name} · {a.appointment_types?.name ?? t.booking}
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
