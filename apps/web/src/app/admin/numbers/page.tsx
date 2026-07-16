import { createClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/platform-admin';
import { Card, EmptyState } from '@/components/ui';
import { getVertical } from '@clinical-crm/core';
import { assignNumber } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NumbersPage() {
  await requirePlatformAdmin();
  const supabase = createClient();

  const [{ data: phones }, { data: clinics }] = await Promise.all([
    supabase
      .from('phone_numbers')
      .select('id, number, provider, is_primary, clinic_id, clinics(id, name, slug, vertical)')
      .order('created_at', { ascending: false }),
    supabase.from('clinics').select('id, name, slug, vertical').order('name'),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Phone number routing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Retarget an incoming number to any tenant. Applies to the very next call — no restart.
        </p>
      </header>

      <Card>
        {!phones?.length ? (
          <EmptyState>No phone numbers connected yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Number</th>
                  <th className="pb-3 pr-4 font-medium">Currently routes to</th>
                  <th className="pb-3 font-medium">Switch to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {phones.map((p) => {
                  const rel = p.clinics as unknown as
                    | { id: string; name: string; slug: string; vertical: string }
                    | Array<{ id: string; name: string; slug: string; vertical: string }>
                    | null;
                  const currentTenant = Array.isArray(rel) ? rel[0] ?? null : rel;
                  const currentVertical = currentTenant ? getVertical(currentTenant.vertical) : null;
                  return (
                    <tr key={p.id} className="text-slate-800">
                      <td className="py-3 pr-4">
                        <div className="font-mono font-medium">{p.number}</div>
                        <div className="text-xs text-slate-500">
                          {p.provider}
                          {p.is_primary && ' · primary'}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {currentTenant ? (
                          <div>
                            <div className="font-medium">{currentTenant.name}</div>
                            <div className="text-xs text-slate-500">
                              /{currentTenant.slug}
                              {currentVertical && ` · ${currentVertical.label}`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">unassigned</span>
                        )}
                      </td>
                      <td className="py-3">
                        <form action={assignNumber} className="flex items-center gap-2">
                          <input type="hidden" name="phoneId" value={p.id} />
                          <select
                            name="clinicId"
                            defaultValue={p.clinic_id}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
                          >
                            {(clinics ?? []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({getVertical(c.vertical).label})
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-md bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700"
                          >
                            Apply
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
