import Link from 'next/link';
import { zonedToUtc } from '@clinical-crm/core';
import { getClinic } from '@/lib/get-clinic';
import { createClient } from '@/lib/supabase/server';
import { addDays, fmtTime, fmtDuration, fmtDateTime, localDateStr, mondayOf } from '@/lib/datetime';
import { Card, EmptyState, OutcomeBadge, SpamBadge, StatusBadge } from '@/components/ui';
import type { Appointment, Call, CallTranscript } from '@/lib/types';
import { RealtimeRefresher } from './realtime-refresher';

export const dynamic = 'force-dynamic';

// Canonical "active or kept" booking statuses — excludes cancelled AND no_show.
// Used for both the "today" and "this week" stats so the two numbers agree.
const KEPT_STATUSES: Appointment['status'][] = ['booked', 'confirmed', 'completed'];

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default async function TodayPage({ params }: { params: { slug: string } }) {
  const { clinic, vertical } = await getClinic(params.slug);
  const t = vertical.terminology;
  const supabase = createClient();
  const tz = clinic.timezone;

  const today = localDateStr(new Date(), tz);
  const dayStart = zonedToUtc(today, '00:00', tz).toISOString();
  const dayEnd = zonedToUtc(addDays(today, 1), '00:00', tz).toISOString();
  const weekStartDate = mondayOf(today);
  const weekStart = zonedToUtc(weekStartDate, '00:00', tz).toISOString();
  const weekEnd = zonedToUtc(addDays(weekStartDate, 7), '00:00', tz).toISOString();

  const [apptsRes, weekCountRes, callsTodayRes, newPatientsRes, recentCallsRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('*, doctors(id, name), patients(id, first_name, last_name, phone), appointment_types(id, name)')
      .eq('clinic_id', clinic.id)
      .gte('starts_at', dayStart)
      .lt('starts_at', dayEnd)
      .order('starts_at'),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinic.id)
      .gte('starts_at', weekStart)
      .lt('starts_at', weekEnd)
      .in('status', KEPT_STATUSES),
    supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinic.id)
      .gte('started_at', dayStart)
      .lt('started_at', dayEnd),
    supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinic.id)
      .gte('created_at', weekStart),
    supabase
      .from('calls')
      .select('*, patients(id, first_name, last_name), call_transcripts(outcome, summary)')
      .eq('clinic_id', clinic.id)
      .order('started_at', { ascending: false })
      .limit(10),
  ]);

  const appointments = (apptsRes.data ?? []) as Appointment[];
  const recentCalls = (recentCallsRes.data ?? []) as Call[];

  // group today's appointments by doctor
  const byDoctor = new Map<string, { name: string; appts: Appointment[] }>();
  for (const a of appointments) {
    const key = a.doctor_id;
    if (!byDoctor.has(key)) byDoctor.set(key, { name: a.doctors?.name ?? `Unknown ${t.provider.toLowerCase()}`, appts: [] });
    byDoctor.get(key)!.appts.push(a);
  }

  return (
    <div className="space-y-6">
      <RealtimeRefresher clinicId={clinic.id} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Today</h1>
          <p className="text-sm text-slate-500">
            {new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}
            {' · '}
            {tz}
          </p>
        </div>
        <Link
          href={`/${clinic.slug}/schedule`}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Open {t.bookings.toLowerCase()}
        </Link>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`${t.bookings} today`} value={appointments.filter((a) => KEPT_STATUSES.includes(a.status)).length} />
        <Stat label={`${t.bookings} this week`} value={weekCountRes.count ?? 0} />
        <Stat label="Calls today" value={callsTodayRes.count ?? 0} />
        <Stat label={`New ${t.contacts.toLowerCase()} this week`} value={newPatientsRes.count ?? 0} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Today's appointments by doctor */}
        <Card title={`Today's ${t.bookings.toLowerCase()}`}>
          {byDoctor.size === 0 ? (
            <EmptyState>No {t.bookings.toLowerCase()} scheduled for today.</EmptyState>
          ) : (
            <div className="space-y-5">
              {Array.from(byDoctor.entries()).map(([doctorId, group]) => (
                <div key={doctorId}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {group.name}
                  </h3>
                  <ul className="divide-y divide-slate-100">
                    {group.appts.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className="w-20 shrink-0 text-sm font-medium tabular-nums text-slate-900">
                            {fmtTime(a.starts_at, tz)}
                          </span>
                          <div>
                            <p className="text-sm text-slate-800">
                              {a.patients ? `${a.patients.first_name} ${a.patients.last_name}` : `Unknown ${t.contact.toLowerCase()}`}
                            </p>
                            <p className="text-xs text-slate-400">{a.appointment_types?.name ?? t.booking}</p>
                          </div>
                        </div>
                        <StatusBadge status={a.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent calls */}
        <Card
          title="Recent calls"
          action={
            <Link href={`/${clinic.slug}/calls`} className="text-xs font-medium text-teal-600 hover:underline">
              View all
            </Link>
          }
        >
          {recentCalls.length === 0 ? (
            <EmptyState>No calls yet. Calls will appear here in real time.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentCalls.map((c) => {
                const t = (Array.isArray(c.call_transcripts) ? c.call_transcripts[0] : c.call_transcripts) as
                  | CallTranscript
                  | null;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/${clinic.slug}/calls/${c.id}`}
                      className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-800">
                          {c.patients ? `${c.patients.first_name} ${c.patients.last_name}` : c.from_number ?? 'Unknown caller'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {fmtDateTime(c.started_at, tz)} · {fmtDuration(c.duration_seconds)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {c.spam_score != null && c.spam_score > 0.7 && <SpamBadge />}
                        <OutcomeBadge outcome={t?.outcome} />
                      </div>
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
