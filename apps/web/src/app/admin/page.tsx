import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/platform-admin';
import { VERTICALS, getVertical } from '@clinical-crm/core';
import { Card, EmptyState } from '@/components/ui';
import { joinTenantAsOwner, setTenantStatus } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-teal-100 text-teal-800',
  onboarding: 'bg-amber-100 text-amber-800',
  suspended: 'bg-rose-100 text-rose-700',
};

const VERTICAL_STYLES: Record<string, string> = {
  clinic: 'bg-sky-100 text-sky-800',
  roofing: 'bg-orange-100 text-orange-800',
  dental: 'bg-teal-100 text-teal-800',
  'law-firm': 'bg-indigo-100 text-indigo-800',
  'hvac-plumbing': 'bg-amber-100 text-amber-800',
  salon: 'bg-pink-100 text-pink-800',
  'real-estate': 'bg-emerald-100 text-emerald-800',
};

export default async function AdminHome() {
  const user = await requirePlatformAdmin();
  const supabase = createClient();

  const { data: clinics } = await supabase
    .from('clinics')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: memberships } = await supabase
    .from('clinic_members')
    .select('clinic_id, role')
    .eq('user_id', user.id);
  const myClinics = new Map((memberships ?? []).map((m) => [m.clinic_id, m.role]));

  // Aggregate stats — cheap: platform-admin RLS allows cross-tenant SELECT.
  const [{ data: calls }, { data: appts }] = await Promise.all([
    supabase.from('calls').select('clinic_id'),
    supabase.from('appointments').select('clinic_id, status'),
  ]);
  const callsBy = new Map<string, number>();
  (calls ?? []).forEach((c) => callsBy.set(c.clinic_id, (callsBy.get(c.clinic_id) ?? 0) + 1));
  const activeApptsBy = new Map<string, number>();
  (appts ?? [])
    .filter((a) => a.status === 'booked' || a.status === 'confirmed')
    .forEach((a) => activeApptsBy.set(a.clinic_id, (activeApptsBy.get(a.clinic_id) ?? 0) + 1));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tenants</h1>
          <p className="mt-1 text-sm text-slate-500">{clinics?.length ?? 0} across the platform</p>
        </div>
        <Link
          href="/admin/new"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
        >
          + New tenant
        </Link>
      </header>

      <Card>
        {!clinics?.length ? (
          <EmptyState>No tenants yet — create the first one.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Tenant</th>
                  <th className="pb-3 pr-4 font-medium">Vertical</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Calls</th>
                  <th className="pb-3 pr-4 font-medium">Active bookings</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clinics.map((c) => {
                  const v = getVertical(c.vertical);
                  const isMember = myClinics.has(c.id);
                  return (
                    <tr key={c.id} className="text-slate-800">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-slate-500">/{c.slug} · {c.timezone}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${VERTICAL_STYLES[v.id] ?? 'bg-slate-100 text-slate-700'}`}>
                          {v.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status] ?? 'bg-slate-100 text-slate-700'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{callsBy.get(c.id) ?? 0}</td>
                      <td className="py-3 pr-4 tabular-nums">{activeApptsBy.get(c.id) ?? 0}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {isMember ? (
                            <Link
                              href={`/${c.slug}`}
                              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Open →
                            </Link>
                          ) : (
                            <form action={joinTenantAsOwner}>
                              <input type="hidden" name="clinicId" value={c.id} />
                              <button
                                type="submit"
                                className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
                              >
                                Join as owner
                              </button>
                            </form>
                          )}
                          <form action={setTenantStatus}>
                            <input type="hidden" name="clinicId" value={c.id} />
                            <input
                              type="hidden"
                              name="status"
                              value={c.status === 'suspended' ? 'active' : 'suspended'}
                            />
                            <button
                              type="submit"
                              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                                c.status === 'suspended'
                                  ? 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {c.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-400">
        Supported verticals: {Object.values(VERTICALS).map((v) => v.label).join(' · ')}
      </p>
    </div>
  );
}
