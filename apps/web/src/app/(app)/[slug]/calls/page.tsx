import Link from 'next/link';
import { zonedToUtc } from '@clinical-crm/core';
import { getClinic } from '@/lib/get-clinic';
import { createClient } from '@/lib/supabase/server';
import { addDays, fmtDateTime, fmtDuration } from '@/lib/datetime';
import { Card, EmptyState, OutcomeBadge, SpamBadge, inputCls } from '@/components/ui';
import type { Call, CallTranscript } from '@/lib/types';

export const dynamic = 'force-dynamic';

const OUTCOMES = ['booked', 'cancelled', 'rescheduled', 'info', 'voicemail', 'spam', 'escalated', 'incomplete'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CallsPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { outcome?: string; from?: string; to?: string };
}) {
  const { clinic, vertical } = await getClinic(params.slug);
  const t = vertical.terminology;
  const supabase = createClient();
  const tz = clinic.timezone;

  const outcome = OUTCOMES.includes(searchParams.outcome ?? '') ? searchParams.outcome! : '';
  const from = DATE_RE.test(searchParams.from ?? '') ? searchParams.from! : '';
  const to = DATE_RE.test(searchParams.to ?? '') ? searchParams.to! : '';

  // use !inner join only when filtering by outcome so calls without transcripts still show otherwise
  const transcriptSel = outcome ? 'call_transcripts!inner(outcome, summary)' : 'call_transcripts(outcome, summary)';
  let query = supabase
    .from('calls')
    .select(`*, patients(id, first_name, last_name), ${transcriptSel}`)
    .eq('clinic_id', clinic.id)
    .order('started_at', { ascending: false })
    .limit(100);

  if (outcome) query = query.eq('call_transcripts.outcome', outcome);
  if (from) query = query.gte('started_at', zonedToUtc(from, '00:00', tz).toISOString());
  if (to) query = query.lt('started_at', zonedToUtc(addDays(to, 1), '00:00', tz).toISOString());

  const { data } = await query;
  const calls = (data ?? []) as unknown as Call[];

  // At-a-glance tallies for the current view.
  const tally = { booked: 0, spam: 0, other: 0 };
  for (const c of calls) {
    const tr = (Array.isArray(c.call_transcripts) ? c.call_transcripts[0] : c.call_transcripts) as CallTranscript | null;
    const isSpam = tr?.outcome === 'spam' || (c.spam_score != null && c.spam_score > 0.7);
    if (isSpam) tally.spam += 1;
    else if (tr?.outcome === 'booked' || tr?.outcome === 'rescheduled') tally.booked += 1;
    else tally.other += 1;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Calls</h1>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">{calls.length} calls</span>
          <span className="rounded-full bg-teal-100 px-2.5 py-1 font-medium text-teal-800">{tally.booked} booked</span>
          <span className="rounded-full bg-rose-100 px-2.5 py-1 font-medium text-rose-700">{tally.spam} spam</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">{tally.other} other</span>
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Outcome</label>
          <select name="outcome" defaultValue={outcome} className={`${inputCls} w-auto`}>
            <option value="">All outcomes</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">From</label>
          <input type="date" name="from" defaultValue={from} className={`${inputCls} w-auto`} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">To</label>
          <input type="date" name="to" defaultValue={to} className={`${inputCls} w-auto`} />
        </div>
        <button type="submit" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Filter
        </button>
        {(outcome || from || to) && (
          <Link href={`/${clinic.slug}/calls`} className="py-2 text-sm text-teal-600 hover:underline">
            Clear
          </Link>
        )}
      </form>

      <Card>
        {calls.length === 0 ? (
          <EmptyState>No calls found.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Time</th>
                  <th className="pb-2 pr-4 font-medium">From</th>
                  <th className="pb-2 pr-4 font-medium">{t.contact}</th>
                  <th className="hidden pb-2 pr-4 font-medium sm:table-cell">Duration</th>
                  <th className="pb-2 pr-4 font-medium">Outcome</th>
                  <th className="hidden pb-2 pr-4 font-medium lg:table-cell">What happened</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calls.map((c) => {
                  const t = (Array.isArray(c.call_transcripts) ? c.call_transcripts[0] : c.call_transcripts) as
                    | CallTranscript
                    | null;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-4 text-slate-700">
                        <Link href={`/${clinic.slug}/calls/${c.id}`} className="hover:text-teal-700">
                          {fmtDateTime(c.started_at, tz)}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-slate-600">{c.from_number ?? '—'}</td>
                      <td className="py-2.5 pr-4">
                        {c.patients ? (
                          <Link href={`/${clinic.slug}/patients/${c.patients.id}`} className="font-medium text-teal-700 hover:underline">
                            {c.patients.first_name} {c.patients.last_name}
                          </Link>
                        ) : (
                          <span className="text-slate-400">Unmatched</span>
                        )}
                      </td>
                      <td className="hidden py-2.5 pr-4 text-slate-500 sm:table-cell">{fmtDuration(c.duration_seconds)}</td>
                      <td className="py-2.5 pr-4">
                        <span className="flex items-center gap-1.5">
                          <OutcomeBadge outcome={t?.outcome} />
                          {c.spam_score != null && c.spam_score > 0.7 && <SpamBadge />}
                        </span>
                      </td>
                      <td className="hidden max-w-[26rem] py-2.5 pr-4 lg:table-cell">
                        <p className="truncate text-xs text-slate-500" title={t?.summary ?? undefined}>
                          {t?.summary ?? '—'}
                        </p>
                      </td>
                      <td className="py-2.5 text-right">
                        <Link href={`/${clinic.slug}/calls/${c.id}`} className="text-xs font-medium text-teal-600 hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
