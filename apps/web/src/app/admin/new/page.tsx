import { requirePlatformAdmin } from '@/lib/platform-admin';
import { Card } from '@/components/ui';
import { VERTICALS } from '@clinical-crm/core';
import { createTenant } from '../actions';

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris',
  'Asia/Karachi', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Sydney',
];

const COMMON_COUNTRIES = [
  ['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'],
  ['PK', 'Pakistan'], ['IN', 'India'], ['AE', 'UAE'], ['AU', 'Australia'],
  ['DE', 'Germany'], ['FR', 'France'],
];

export default async function NewTenantPage() {
  await requirePlatformAdmin();

  return (
    <div className="max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Create tenant</h1>
        <p className="mt-1 text-sm text-slate-500">
          A new tenant gets its own isolated workspace and default AI receptionist config.
        </p>
      </header>

      <Card>
        <form action={createTenant} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Business name</label>
            <input
              name="name"
              required
              minLength={2}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
              placeholder="e.g. Skyline Roofing Co."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Vertical</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {Object.values(VERTICALS).map((v, i) => (
                <label
                  key={v.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 hover:border-violet-300 hover:bg-violet-50/40 has-[input:checked]:border-violet-500 has-[input:checked]:bg-violet-50"
                >
                  <input
                    type="radio"
                    name="vertical"
                    value={v.id}
                    defaultChecked={i === 0}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-900">{v.label}</div>
                    <div className="text-xs text-slate-500">
                      {v.terminology.contacts} · {v.terminology.bookings} · {v.terminology.providers}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Timezone</label>
              <select
                name="timezone"
                defaultValue="America/New_York"
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Country</label>
              <select
                name="country"
                defaultValue="US"
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {COMMON_COUNTRIES.map(([code, label]) => (
                  <option key={code} value={code}>{label} ({code})</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">Used to normalize phone numbers callers say.</p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
            >
              Create tenant
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
