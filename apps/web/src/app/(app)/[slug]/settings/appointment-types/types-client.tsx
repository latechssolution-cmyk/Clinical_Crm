'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AppointmentType } from '@/lib/types';
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from '@/components/ui';
import { createAppointmentType, deleteAppointmentType, updateAppointmentType } from '../actions';

export function TypesClient({
  slug,
  bookingLabel,
  canEdit,
  types,
}: {
  slug: string;
  bookingLabel: string;
  canEdit: boolean;
  types: AppointmentType[];
}) {
  const bookingLc = bookingLabel.toLowerCase();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [duration, setDuration] = useState(30);
  const [buffer, setBuffer] = useState(0);
  const [byAi, setByAi] = useState(true);

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
          Only owners and staff can manage {bookingLc} types.
        </p>
      )}

      {canEdit && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Add {bookingLc} type</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. Standard ${bookingLc}`} />
            </div>
            <div>
              <label className={labelCls}>Duration (min)</label>
              <input type="number" min={5} max={480} className={`${inputCls} w-28`} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div>
              <label className={labelCls}>Buffer (min)</label>
              <input type="number" min={0} max={120} className={`${inputCls} w-28`} value={buffer} onChange={(e) => setBuffer(Number(e.target.value))} />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-500">
              <input type="checkbox" checked={byAi} onChange={(e) => setByAi(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              Bookable by AI
            </label>
            <button
              className={btnPrimary}
              disabled={pending || name.trim().length < 2}
              onClick={() =>
                run(async () => {
                  const res = await createAppointmentType({ slug, name, durationMinutes: duration, bufferMinutes: buffer, bookableByAi: byAi });
                  if (res.ok) setName('');
                  return res;
                })
              }
            >
              Add
            </button>
          </div>
        </div>
      )}

      {types.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No {bookingLc} types yet.</p>
      ) : (
        <div className="space-y-2">
          {types.map((t) => (
            <TypeRow key={t.id} slug={slug} canEdit={canEdit} type={t} run={run} pending={pending} />
          ))}
        </div>
      )}
    </div>
  );
}

function TypeRow({
  slug,
  canEdit,
  type: t,
  run,
  pending,
}: {
  slug: string;
  canEdit: boolean;
  type: AppointmentType;
  run: (fn: () => Promise<{ ok?: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name);
  const [duration, setDuration] = useState(t.duration_minutes);
  const [buffer, setBuffer] = useState(t.buffer_minutes);

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${!t.active ? 'opacity-60' : ''}`}>
      {editing ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Duration</label>
            <input type="number" min={5} max={480} className={`${inputCls} w-24`} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>Buffer</label>
            <input type="number" min={0} max={120} className={`${inputCls} w-24`} value={buffer} onChange={(e) => setBuffer(Number(e.target.value))} />
          </div>
          <button
            className={btnPrimary}
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await updateAppointmentType({ slug, typeId: t.id, name, durationMinutes: duration, bufferMinutes: buffer });
                if (res.ok) setEditing(false);
                return res;
              })
            }
          >
            Save
          </button>
          <button className={btnSecondary} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {t.name}
              {!t.active && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">inactive</span>}
            </p>
            <p className="text-xs text-slate-400">
              {t.duration_minutes} min{t.buffer_minutes > 0 && ` + ${t.buffer_minutes} min buffer`} ·{' '}
              {t.bookable_by_ai ? 'AI can book' : 'dashboard only'}
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                className={btnSecondary}
                disabled={pending}
                onClick={() => run(() => updateAppointmentType({ slug, typeId: t.id, bookableByAi: !t.bookable_by_ai }))}
              >
                {t.bookable_by_ai ? 'Disable AI booking' : 'Enable AI booking'}
              </button>
              <button
                className={btnSecondary}
                disabled={pending}
                onClick={() => run(() => updateAppointmentType({ slug, typeId: t.id, active: !t.active }))}
              >
                {t.active ? 'Deactivate' : 'Activate'}
              </button>
              <button className={btnSecondary} onClick={() => setEditing(true)}>Edit</button>
              <button className={btnDanger} disabled={pending} onClick={() => run(() => deleteAppointmentType(slug, t.id))}>
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
