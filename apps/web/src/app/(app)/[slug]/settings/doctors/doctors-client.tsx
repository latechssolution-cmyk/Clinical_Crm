'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AvailabilityExceptionRow, AvailabilityRuleRow, Doctor } from '@/lib/types';
import { WEEKDAYS, WEEKDAYS_SHORT, hhmm } from '@/lib/datetime';
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from '@/components/ui';
import {
  addAvailabilityException,
  addAvailabilityRule,
  createDoctor,
  deleteAvailabilityException,
  deleteAvailabilityRule,
  deleteDoctor,
  updateDoctor,
} from '../actions';

export function DoctorsClient({
  slug,
  canEdit,
  doctors,
  rules,
  exceptions,
}: {
  slug: string;
  canEdit: boolean;
  doctors: Doctor[];
  rules: AvailabilityRuleRow[];
  exceptions: AvailabilityExceptionRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [expanded, setExpanded] = useState<string | null>(doctors[0]?.id ?? null);

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="max-w-3xl space-y-5">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!canEdit && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Only owners and staff can manage doctors.
        </p>
      )}

      {canEdit && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Add doctor</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Dr. Jane Smith" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className={labelCls}>Specialty</label>
              <input className={inputCls} value={newSpecialty} onChange={(e) => setNewSpecialty(e.target.value)} placeholder="General practice" />
            </div>
            <button
              className={btnPrimary}
              disabled={pending || newName.trim().length < 2}
              onClick={() =>
                run(async () => {
                  const res = await createDoctor({ slug, name: newName, specialty: newSpecialty });
                  if (res.ok) {
                    setNewName('');
                    setNewSpecialty('');
                  }
                  return res;
                })
              }
            >
              Add
            </button>
          </div>
        </div>
      )}

      {doctors.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          No doctors yet. Add your first doctor above to start accepting appointments.
        </p>
      ) : (
        doctors.map((d) => (
          <DoctorCard
            key={d.id}
            slug={slug}
            canEdit={canEdit}
            doctor={d}
            rules={rules.filter((r) => r.doctor_id === d.id)}
            exceptions={exceptions.filter((e) => e.doctor_id === d.id)}
            expanded={expanded === d.id}
            onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
            run={run}
            pending={pending}
          />
        ))
      )}
    </div>
  );
}

function DoctorCard({
  slug,
  canEdit,
  doctor,
  rules,
  exceptions,
  expanded,
  onToggle,
  run,
  pending,
}: {
  slug: string;
  canEdit: boolean;
  doctor: Doctor;
  rules: AvailabilityRuleRow[];
  exceptions: AvailabilityExceptionRow[];
  expanded: boolean;
  onToggle: () => void;
  run: (fn: () => Promise<{ ok?: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(doctor.name);
  const [specialty, setSpecialty] = useState(doctor.specialty ?? '');

  // new rule form
  const [ruleWeekday, setRuleWeekday] = useState(1);
  const [ruleStart, setRuleStart] = useState('09:00');
  const [ruleEnd, setRuleEnd] = useState('17:00');

  // new exception form
  const [excDate, setExcDate] = useState('');
  const [excKind, setExcKind] = useState<'blocked' | 'extra'>('blocked');
  const [excWholeDay, setExcWholeDay] = useState(true);
  const [excStart, setExcStart] = useState('09:00');
  const [excEnd, setExcEnd] = useState('12:00');
  const [excReason, setExcReason] = useState('');

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <span className="text-sm font-semibold text-slate-800">{doctor.name}</span>
          {doctor.specialty && <span className="ml-2 text-xs text-slate-400">{doctor.specialty}</span>}
          {!doctor.active && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">inactive</span>
          )}
        </div>
        <span className="text-slate-400">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-slate-100 p-4">
          {/* Basics */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px]">
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className={labelCls}>Specialty</label>
              <input className={inputCls} value={specialty} onChange={(e) => setSpecialty(e.target.value)} disabled={!canEdit} />
            </div>
            {canEdit && (
              <>
                <button
                  className={btnSecondary}
                  disabled={pending}
                  onClick={() => run(() => updateDoctor({ slug, doctorId: doctor.id, name, specialty: specialty.trim() || null }))}
                >
                  Save
                </button>
                <button
                  className={btnSecondary}
                  disabled={pending}
                  onClick={() => run(() => updateDoctor({ slug, doctorId: doctor.id, active: !doctor.active }))}
                >
                  {doctor.active ? 'Deactivate' : 'Activate'}
                </button>
                <button className={btnDanger} disabled={pending} onClick={() => run(() => deleteDoctor(slug, doctor.id))}>
                  Delete
                </button>
              </>
            )}
          </div>

          {/* Weekly availability */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Weekly availability
            </h4>
            {rules.length === 0 ? (
              <p className="mb-2 text-sm text-slate-400">
                No availability yet — this doctor has no bookable slots.
              </p>
            ) : (
              <ul className="mb-2 space-y-1">
                {rules.map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                    <span className="text-slate-700">
                      <span className="inline-block w-24 font-medium">{WEEKDAYS[r.weekday]}</span>
                      {hhmm(r.start_time)} – {hhmm(r.end_time)}
                    </span>
                    {canEdit && (
                      <button
                        className="text-xs text-rose-500 hover:underline"
                        disabled={pending}
                        onClick={() => run(() => deleteAvailabilityRule(slug, r.id))}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <div className="flex flex-wrap items-end gap-2">
                <select className={`${inputCls} w-auto`} value={ruleWeekday} onChange={(e) => setRuleWeekday(Number(e.target.value))}>
                  {WEEKDAYS_SHORT.map((w, i) => (
                    <option key={i} value={i}>{w}</option>
                  ))}
                </select>
                <input type="time" className={`${inputCls} w-32`} value={ruleStart} onChange={(e) => setRuleStart(e.target.value)} />
                <span className="pb-2 text-slate-400">–</span>
                <input type="time" className={`${inputCls} w-32`} value={ruleEnd} onChange={(e) => setRuleEnd(e.target.value)} />
                <button
                  className={btnSecondary}
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      addAvailabilityRule({ slug, doctorId: doctor.id, weekday: ruleWeekday, startTime: ruleStart, endTime: ruleEnd })
                    )
                  }
                >
                  + Add hours
                </button>
              </div>
            )}
          </div>

          {/* Exceptions */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Exceptions (vacations, blocked time, extra sessions)
            </h4>
            {exceptions.length > 0 && (
              <ul className="mb-2 space-y-1">
                {exceptions.map((e) => (
                  <li key={e.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                    <span className="text-slate-700">
                      <span className="mr-2 font-medium">{e.date}</span>
                      <span
                        className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.kind === 'blocked' ? 'bg-rose-100 text-rose-700' : 'bg-teal-100 text-teal-800'
                        }`}
                      >
                        {e.kind}
                      </span>
                      {e.start_time ? `${hhmm(e.start_time)} – ${hhmm(e.end_time)}` : 'whole day'}
                      {e.reason && <span className="ml-2 text-xs text-slate-400">{e.reason}</span>}
                    </span>
                    {canEdit && (
                      <button
                        className="text-xs text-rose-500 hover:underline"
                        disabled={pending}
                        onClick={() => run(() => deleteAvailabilityException(slug, e.id))}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <div className="flex flex-wrap items-end gap-2">
                <input type="date" className={`${inputCls} w-auto`} value={excDate} onChange={(e) => setExcDate(e.target.value)} />
                <select
                  className={`${inputCls} w-auto`}
                  value={excKind}
                  onChange={(e) => {
                    const kind = e.target.value as 'blocked' | 'extra';
                    setExcKind(kind);
                    if (kind === 'extra') setExcWholeDay(false);
                  }}
                >
                  <option value="blocked">Blocked</option>
                  <option value="extra">Extra</option>
                </select>
                {excKind === 'blocked' && (
                  <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={excWholeDay}
                      onChange={(e) => setExcWholeDay(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    Whole day
                  </label>
                )}
                {(!excWholeDay || excKind === 'extra') && (
                  <>
                    <input type="time" className={`${inputCls} w-32`} value={excStart} onChange={(e) => setExcStart(e.target.value)} />
                    <span className="pb-2 text-slate-400">–</span>
                    <input type="time" className={`${inputCls} w-32`} value={excEnd} onChange={(e) => setExcEnd(e.target.value)} />
                  </>
                )}
                <input
                  className={`${inputCls} w-40`}
                  placeholder="Reason (optional)"
                  value={excReason}
                  onChange={(e) => setExcReason(e.target.value)}
                />
                <button
                  className={btnSecondary}
                  disabled={pending || !excDate}
                  onClick={() =>
                    run(() =>
                      addAvailabilityException({
                        slug,
                        doctorId: doctor.id,
                        date: excDate,
                        kind: excKind,
                        startTime: excKind === 'blocked' && excWholeDay ? null : excStart,
                        endTime: excKind === 'blocked' && excWholeDay ? null : excEnd,
                        reason: excReason,
                      })
                    )
                  }
                >
                  + Add exception
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
