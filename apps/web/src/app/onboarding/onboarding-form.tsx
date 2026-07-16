'use client';

import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createClinicAction } from './actions';
import { btnPrimary, inputCls, labelCls } from '@/components/ui';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Warsaw',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Perth',
  'Pacific/Auckland',
  'UTC',
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} w-full`}>
      {pending ? 'Creating clinic…' : 'Create clinic'}
    </button>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useFormState(createClinicAction, null);
  const [name, setName] = useState('');
  // stable random suffix so the slug doesn't flicker while typing
  const suffix = useMemo(() => Math.random().toString(36).slice(2, 6), []);
  const slug = name.trim() ? `${slugify(name)}-${suffix}` : '';

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      )}
      <div>
        <label className={labelCls} htmlFor="name">Clinic name</label>
        <input
          id="name"
          name="name"
          required
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lakeside Family Practice"
        />
        {slug && (
          <p className="mt-1 text-xs text-slate-400">
            Workspace URL: <span className="font-mono text-slate-500">/{slug}</span>
          </p>
        )}
        <input type="hidden" name="slug" value={slug} />
      </div>
      <div>
        <label className={labelCls} htmlFor="timezone">Timezone</label>
        <select id="timezone" name="timezone" required className={inputCls} defaultValue="America/New_York">
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton />
    </form>
  );
}
