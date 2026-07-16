'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessHours, Clinic } from '@/lib/types';
import { WEEKDAYS } from '@/lib/datetime';
import { btnPrimary, inputCls, labelCls } from '@/components/ui';
import { updateClinicGeneral } from './actions';

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto',
  'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo', 'Europe/London',
  'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Warsaw', 'Africa/Lagos', 'Africa/Nairobi',
  'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Bangkok', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo',
  'Asia/Seoul', 'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland', 'UTC',
];

interface DayState {
  closed: boolean;
  open: string;
  close: string;
}

function initHours(bh: BusinessHours): DayState[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = bh?.[String(i)];
    if (!d) return { closed: true, open: '09:00', close: '17:00' };
    return { closed: !!d.closed, open: d.open || '09:00', close: d.close || '17:00' };
  });
}

export function GeneralForm({ clinic, canEdit }: { clinic: Clinic; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(clinic.name);
  const [timezone, setTimezone] = useState(clinic.timezone);
  const [address, setAddress] = useState(clinic.address ?? '');
  const [phone, setPhone] = useState(clinic.contact_phone ?? '');
  const [email, setEmail] = useState(clinic.contact_email ?? '');
  const [hours, setHours] = useState<DayState[]>(() => initHours(clinic.business_hours));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function setDay(i: number, patch: Partial<DayState>) {
    setHours((h) => h.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  function save() {
    setError(null);
    const business_hours: BusinessHours = {};
    hours.forEach((d, i) => {
      business_hours[String(i)] = { open: d.open, close: d.close, closed: d.closed };
    });
    startTransition(async () => {
      const res = await updateClinicGeneral({
        slug: clinic.slug,
        name,
        timezone,
        address: address.trim() || null,
        contact_phone: phone.trim() || null,
        contact_email: email.trim() || null,
        business_hours,
      });
      if (res.error) setError(res.error);
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-5">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!canEdit && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Only clinic owners can change these settings.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Clinic name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <label className={labelCls}>Timezone</label>
          <select className={inputCls} value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!canEdit}>
            {!TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Address</label>
          <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <label className={labelCls}>Contact phone</label>
          <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15551234567" disabled={!canEdit} />
        </div>
        <div>
          <label className={labelCls}>Contact email</label>
          <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canEdit} />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Business hours</h3>
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          {hours.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-sm text-slate-600">{WEEKDAYS[i]}</span>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={!d.closed}
                  onChange={(e) => setDay(i, { closed: !e.target.checked })}
                  disabled={!canEdit}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Open
              </label>
              {!d.closed && (
                <>
                  <input
                    type="time"
                    className={`${inputCls} w-32`}
                    value={d.open}
                    onChange={(e) => setDay(i, { open: e.target.value })}
                    disabled={!canEdit}
                  />
                  <span className="text-slate-400">–</span>
                  <input
                    type="time"
                    className={`${inputCls} w-32`}
                    value={d.close}
                    onChange={(e) => setDay(i, { close: e.target.value })}
                    disabled={!canEdit}
                  />
                </>
              )}
              {d.closed && <span className="text-sm text-slate-400">Closed</span>}
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <button className={btnPrimary} onClick={save} disabled={pending}>
          {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
        </button>
      )}
    </div>
  );
}
