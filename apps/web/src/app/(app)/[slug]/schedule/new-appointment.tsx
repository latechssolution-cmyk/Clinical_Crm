'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AppointmentType, Doctor } from '@/lib/types';
import { fmtDayLabel, fmtTime } from '@/lib/datetime';
import { btnPrimary, btnSecondary, inputCls, labelCls } from '@/components/ui';
import {
  bookAppointment,
  createPatientInline,
  getOpenSlots,
  searchPatients,
  type PatientDto,
  type SlotDto,
} from './actions';

export function NewAppointmentModal({
  slug,
  timezone,
  today,
  doctors,
  appointmentTypes,
  onClose,
}: {
  slug: string;
  timezone: string;
  today: string;
  doctors: Doctor[];
  appointmentTypes: AppointmentType[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // step 1
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? '');
  const [typeId, setTypeId] = useState(appointmentTypes[0]?.id ?? '');
  const [date, setDate] = useState(today);

  // step 2
  const [slots, setSlots] = useState<SlotDto[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<SlotDto | null>(null);

  // step 3 — patient
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [patient, setPatient] = useState<PatientDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const step = !slot ? (slots === null ? 1 : 2) : 3;

  async function loadSlots() {
    if (!doctorId || !typeId || !date) {
      setError('Pick a doctor, appointment type and date first.');
      return;
    }
    setError(null);
    setLoadingSlots(true);
    const res = await getOpenSlots({ slug, doctorId, appointmentTypeId: typeId, date });
    setLoadingSlots(false);
    if (res.error) setError(res.error);
    else setSlots(res.slots ?? []);
  }

  async function doSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const res = await searchPatients(slug, q);
    setSearching(false);
    setResults(res.patients ?? []);
  }

  async function createPatient() {
    setError(null);
    const res = await createPatientInline({ slug, firstName: newFirst, lastName: newLast, phone: newPhone });
    if (res.error) setError(res.error);
    else if (res.patient) {
      setPatient(res.patient);
      setCreating(false);
    }
  }

  function book() {
    if (!slot || !patient) return;
    setError(null);
    startTransition(async () => {
      const res = await bookAppointment({
        slug,
        doctorId,
        patientId: patient.id,
        appointmentTypeId: typeId,
        startsAt: slot.startsAt,
      });
      if (res.error) {
        setError(res.error);
        // refresh slots — the one we picked may be gone
        setSlot(null);
        await loadSlots();
      } else {
        onClose();
        router.refresh();
      }
    });
  }

  const doctorName = doctors.find((d) => d.id === doctorId)?.name;
  const typeName = appointmentTypes.find((t) => t.id === typeId)?.name;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">New appointment</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {doctors.length === 0 || appointmentTypes.length === 0 ? (
          <p className="text-sm text-slate-500">
            Add at least one active doctor and appointment type in Settings before booking.
          </p>
        ) : step === 1 || step === 2 ? (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Doctor</label>
              <select className={inputCls} value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setSlots(null); }}>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Appointment type</label>
              <select className={inputCls} value={typeId} onChange={(e) => { setTypeId(e.target.value); setSlots(null); }}>
                {appointmentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.duration_minutes} min)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" className={inputCls} value={date} onChange={(e) => { setDate(e.target.value); setSlots(null); }} />
            </div>

            {slots === null ? (
              <button className={`${btnPrimary} w-full`} onClick={loadSlots} disabled={loadingSlots}>
                {loadingSlots ? 'Finding slots…' : 'Find open slots'}
              </button>
            ) : (
              <div>
                <label className={labelCls}>Open slots — {fmtDayLabel(date)}</label>
                {slots.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    No open slots. The doctor may have no availability rules for this weekday, or all slots are taken.
                  </p>
                ) : (
                  <div className="grid max-h-52 grid-cols-3 gap-2 overflow-y-auto">
                    {slots.map((s) => (
                      <button
                        key={s.startsAt}
                        onClick={() => setSlot(s)}
                        className="rounded-lg border border-teal-200 bg-teal-50 px-2 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-100"
                      >
                        {fmtTime(s.startsAt, timezone)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-medium">{doctorName}</span> · {typeName}
              <br />
              {fmtDayLabel(date)} at {slot ? fmtTime(slot.startsAt, timezone) : ''}
              <button className="ml-2 text-xs text-teal-600 hover:underline" onClick={() => setSlot(null)}>
                change
              </button>
            </div>

            {patient ? (
              <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {patient.first_name} {patient.last_name}
                  </p>
                  <p className="text-xs text-slate-500">{patient.phone}</p>
                </div>
                <button className="text-xs text-teal-700 hover:underline" onClick={() => setPatient(null)}>
                  change
                </button>
              </div>
            ) : creating ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">New patient</p>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="First name" value={newFirst} onChange={(e) => setNewFirst(e.target.value)} />
                  <input className={inputCls} placeholder="Last name" value={newLast} onChange={(e) => setNewLast(e.target.value)} />
                </div>
                <input className={inputCls} placeholder="+15551234567" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                <div className="flex gap-2">
                  <button className={btnPrimary} onClick={createPatient}>Create patient</button>
                  <button className={btnSecondary} onClick={() => setCreating(false)}>Back to search</button>
                </div>
              </div>
            ) : (
              <div>
                <label className={labelCls}>Patient — search by name or phone</label>
                <input
                  className={inputCls}
                  placeholder="Start typing…"
                  value={query}
                  onChange={(e) => doSearch(e.target.value)}
                  autoFocus
                />
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {searching && <p className="text-xs text-slate-400">Searching…</p>}
                  {results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPatient(p)}
                      className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-800">{p.first_name} {p.last_name}</span>
                      <span className="ml-2 text-xs text-slate-400">{p.phone}</span>
                    </button>
                  ))}
                  {!searching && query.trim().length >= 2 && results.length === 0 && (
                    <p className="text-xs text-slate-400">No matches.</p>
                  )}
                </div>
                <button className="mt-2 text-sm font-medium text-teal-600 hover:underline" onClick={() => setCreating(true)}>
                  + Create new patient
                </button>
              </div>
            )}

            <button className={`${btnPrimary} w-full`} disabled={!patient || pending} onClick={book}>
              {pending ? 'Booking…' : 'Book appointment'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
