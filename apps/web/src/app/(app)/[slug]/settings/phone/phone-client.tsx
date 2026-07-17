'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PhoneNumberRow } from '@/lib/types';
import { btnPrimary, inputCls, labelCls } from '@/components/ui';
import { addPhoneNumber } from '../actions';

export function PhoneClient({
  slug,
  isOwner,
  numbers,
}: {
  slug: string;
  isOwner: boolean;
  numbers: PhoneNumberRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [isPrimary, setIsPrimary] = useState(numbers.length === 0);

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await addPhoneNumber({ slug, number: number.trim(), isPrimary });
      if (res.error) setError(res.error);
      else {
        setNumber('');
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-5">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Business phone numbers</h2>
        </div>
        {numbers.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">
            No phone numbers connected yet. Inbound calls are routed to your business by these numbers.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {numbers.map((n) => (
              <li key={n.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium tabular-nums text-slate-800">{n.number}</p>
                  <p className="text-xs text-slate-400">{n.provider}</p>
                </div>
                {n.is_primary && (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                    primary
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {isOwner ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Add an existing number</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className={labelCls}>Number (E.164)</label>
              <input
                className={inputCls}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="+15551234567"
              />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Primary
            </label>
            <button className={btnPrimary} disabled={pending || !number.trim()} onClick={add}>
              {pending ? 'Adding…' : 'Add number'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Number provisioning through Twilio is handled by the platform — this form registers a number you already own for inbound routing.
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Only owners can manage phone numbers.
        </p>
      )}
    </div>
  );
}
