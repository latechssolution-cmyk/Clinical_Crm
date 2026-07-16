'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Appointment, AppointmentStatus, AppointmentType, Doctor } from '@/lib/types';
import { addDays, fmtDayLabel, fmtTime, localDateStr } from '@/lib/datetime';
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls, StatusBadge } from '@/components/ui';
import { cancelAppointment, getOpenSlots, rescheduleAppointment, type SlotDto } from './actions';
import { NewAppointmentModal } from './new-appointment';

const BLOCK_STYLES: Record<AppointmentStatus, string> = {
  booked: 'border-sky-300 bg-sky-50 hover:bg-sky-100',
  confirmed: 'border-teal-300 bg-teal-50 hover:bg-teal-100',
  completed: 'border-slate-300 bg-slate-100 hover:bg-slate-200',
  cancelled: 'border-rose-200 bg-rose-50 opacity-60 hover:opacity-90',
  no_show: 'border-amber-300 bg-amber-50 hover:bg-amber-100',
};

export interface ScheduleTerms {
  contact: string;
  contacts: string;
  booking: string;
  bookings: string;
  provider: string;
  providers: string;
}

const DEFAULT_TERMS: ScheduleTerms = {
  contact: 'Patient', contacts: 'Patients',
  booking: 'Appointment', bookings: 'Appointments',
  provider: 'Doctor', providers: 'Doctors',
};

export function ScheduleClient({
  slug,
  terms = DEFAULT_TERMS,
  timezone,
  today,
  weekStart,
  doctorFilter,
  appointments,
  doctors,
  appointmentTypes,
}: {
  slug: string;
  terms?: ScheduleTerms;
  timezone: string;
  today: string;
  weekStart: string;
  doctorFilter: string;
  appointments: Appointment[];
  doctors: Doctor[];
  appointmentTypes: AppointmentType[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [showNew, setShowNew] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const d of days) map.set(d, []);
    for (const a of appointments) {
      const day = localDateStr(new Date(a.starts_at), timezone);
      map.get(day)?.push(a);
    }
    return map;
  }, [appointments, days, timezone]);

  function navigate(newWeek: string, newDoctor: string) {
    const sp = new URLSearchParams();
    sp.set('week', newWeek);
    if (newDoctor) sp.set('doctor', newDoctor);
    router.push(`/${slug}/schedule?${sp.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">{terms.bookings}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${inputCls} w-auto`}
            value={doctorFilter}
            onChange={(e) => navigate(weekStart, e.target.value)}
          >
            <option value="">All {terms.providers.toLowerCase()}</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <div className="flex items-center rounded-lg border border-slate-300 bg-white">
            <button
              className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => navigate(addDays(weekStart, -7), doctorFilter)}
            >
              ←
            </button>
            <button
              className="border-x border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => navigate(today, doctorFilter)}
            >
              This week
            </button>
            <button
              className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => navigate(addDays(weekStart, 7), doctorFilter)}
            >
              →
            </button>
          </div>
          <button className={btnPrimary} onClick={() => setShowNew(true)}>
            + New {terms.booking.toLowerCase()}
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        Week of {fmtDayLabel(weekStart)} · times shown in {timezone}
      </p>

      {/* Week grid */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid min-w-[880px] grid-cols-7 divide-x divide-slate-100">
          {days.map((day) => (
            <div key={day} className={`min-h-[420px] ${day === today ? 'bg-teal-50/40' : ''}`}>
              <div
                className={`sticky top-0 border-b border-slate-100 px-2 py-2 text-center text-xs font-semibold ${
                  day === today ? 'text-teal-700' : 'text-slate-500'
                }`}
              >
                {fmtDayLabel(day)}
              </div>
              <div className="space-y-1.5 p-1.5">
                {(byDay.get(day) ?? []).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelected(a)}
                    className={`block w-full rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${BLOCK_STYLES[a.status]}`}
                  >
                    <span className="font-semibold tabular-nums text-slate-700">
                      {fmtTime(a.starts_at, timezone)}
                    </span>
                    <span className="mt-0.5 block truncate text-slate-800">
                      {a.patients ? `${a.patients.first_name} ${a.patients.last_name}` : terms.contact}
                    </span>
                    {!doctorFilter && (
                      <span className="block truncate text-[11px] text-slate-400">{a.doctors?.name}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <AppointmentPanel
          slug={slug}
          terms={terms}
          timezone={timezone}
          appointment={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {showNew && (
        <NewAppointmentModal
          slug={slug}
          timezone={timezone}
          today={today}
          doctors={doctors.filter((d) => d.active)}
          appointmentTypes={appointmentTypes}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appointment detail / cancel / reschedule panel

function AppointmentPanel({
  slug,
  terms,
  timezone,
  appointment: a,
  onClose,
}: {
  slug: string;
  terms: ScheduleTerms;
  timezone: string;
  appointment: Appointment;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'view' | 'cancel' | 'reschedule'>('view');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // reschedule state
  const [newDate, setNewDate] = useState(localDateStr(new Date(a.starts_at), timezone));
  const [slots, setSlots] = useState<SlotDto[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const active = a.status === 'booked' || a.status === 'confirmed';

  async function loadSlots(date: string) {
    if (!a.appointment_type_id) {
      setError('This appointment has no type — reschedule is unavailable.');
      return;
    }
    setLoadingSlots(true);
    setSlots(null);
    const res = await getOpenSlots({
      slug,
      doctorId: a.doctor_id,
      appointmentTypeId: a.appointment_type_id,
      date,
    });
    setLoadingSlots(false);
    if (res.error) setError(res.error);
    else setSlots(res.slots ?? []);
  }

  function doCancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelAppointment({ slug, appointmentId: a.id, reason });
      if (res.error) setError(res.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  function doReschedule(startsAt: string) {
    setError(null);
    startTransition(async () => {
      const res = await rescheduleAppointment({ slug, appointmentId: a.id, newStartsAt: startsAt, reason });
      if (res.error) setError(res.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {a.patients ? `${a.patients.first_name} ${a.patients.last_name}` : terms.booking}
            </h2>
            <p className="text-sm text-slate-500">
              {fmtDayLabel(localDateStr(new Date(a.starts_at), timezone))} · {fmtTime(a.starts_at, timezone)}–
              {fmtTime(a.ends_at, timezone)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <dl className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">{terms.provider}</dt><dd className="text-slate-800">{a.doctors?.name ?? '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Type</dt><dd className="text-slate-800">{a.appointment_types?.name ?? '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Phone</dt><dd className="text-slate-800">{a.patients?.phone ?? '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><StatusBadge status={a.status} /></dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Source</dt><dd className="text-slate-800">{a.source === 'ai_call' ? 'AI receptionist' : a.source}</dd></div>
          {a.cancellation_reason && (
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Cancel reason</dt><dd className="text-right text-slate-800">{a.cancellation_reason}</dd></div>
          )}
          {a.notes && <div><dt className="text-slate-500">Notes</dt><dd className="mt-1 text-slate-800">{a.notes}</dd></div>}
        </dl>

        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {active && mode === 'view' && (
          <div className="flex gap-2">
            <button className={btnSecondary} onClick={() => { setMode('reschedule'); loadSlots(newDate); }}>
              Reschedule
            </button>
            <button className={btnDanger} onClick={() => setMode('cancel')}>
              Cancel {terms.booking.toLowerCase()}
            </button>
          </div>
        )}

        {mode === 'cancel' && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Cancellation reason</label>
              <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. patient request" />
            </div>
            <div className="flex gap-2">
              <button className={btnDanger} disabled={pending} onClick={doCancel}>
                {pending ? 'Cancelling…' : 'Confirm cancel'}
              </button>
              <button className={btnSecondary} onClick={() => setMode('view')}>Back</button>
            </div>
          </div>
        )}

        {mode === 'reschedule' && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>New date</label>
              <input
                type="date"
                className={inputCls}
                value={newDate}
                onChange={(e) => {
                  setNewDate(e.target.value);
                  if (e.target.value) loadSlots(e.target.value);
                }}
              />
            </div>
            <div>
              <label className={labelCls}>Open slots</label>
              {loadingSlots ? (
                <p className="text-sm text-slate-400">Loading slots…</p>
              ) : slots && slots.length > 0 ? (
                <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto">
                  {slots.map((s) => (
                    <button
                      key={s.startsAt}
                      disabled={pending}
                      onClick={() => doReschedule(s.startsAt)}
                      className="rounded-lg border border-teal-200 bg-teal-50 px-2 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-50"
                    >
                      {fmtTime(s.startsAt, timezone)}
                    </button>
                  ))}
                </div>
              ) : slots ? (
                <p className="text-sm text-slate-400">No open slots on this date.</p>
              ) : null}
            </div>
            <button className={btnSecondary} onClick={() => setMode('view')}>Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
