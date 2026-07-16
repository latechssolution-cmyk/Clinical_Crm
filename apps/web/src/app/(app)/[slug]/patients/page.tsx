import Link from 'next/link';
import { getClinic } from '@/lib/get-clinic';
import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/datetime';
import { Card, EmptyState, inputCls } from '@/components/ui';
import type { Patient } from '@/lib/types';
import { NewPatientForm } from './new-patient-form';

export const dynamic = 'force-dynamic';

export default async function PatientsPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { q?: string; new?: string };
}) {
  const { clinic, vertical } = await getClinic(params.slug);
  const t = vertical.terminology;
  const supabase = createClient();
  const q = (searchParams.q ?? '').trim();

  let query = supabase
    .from('patients')
    .select('*')
    .eq('clinic_id', clinic.id)
    .order('last_name')
    .limit(100);

  if (q) {
    const safe = q.replace(/[%_,()]/g, ' ').trim();
    query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }

  const { data } = await query;
  const patients = (data ?? []) as Patient[];
  const showNew = searchParams.new === '1';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">{t.contacts}</h1>
        <Link
          href={`/${clinic.slug}/patients?new=1`}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          + New {t.contact.toLowerCase()}
        </Link>
      </div>

      {showNew && (
        <Card title={`New ${t.contact.toLowerCase()}`}>
          <NewPatientForm
            slug={clinic.slug}
            contactLabel={t.contact}
            showAddress={vertical.requiredContactFields.includes('address')}
            showDateOfBirth={vertical.requiredContactFields.includes('date_of_birth')}
          />
        </Card>
      )}

      <form method="get" className="max-w-sm">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name or phone…"
          className={inputCls}
        />
      </form>

      <Card>
        {patients.length === 0 ? (
          <EmptyState>{q ? `No ${t.contacts.toLowerCase()} match your search.` : `No ${t.contacts.toLowerCase()} yet.`}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Phone</th>
                  <th className="hidden pb-2 pr-4 font-medium sm:table-cell">Email</th>
                  <th className="hidden pb-2 pr-4 font-medium md:table-cell">Added</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4">
                      <Link href={`/${clinic.slug}/patients/${p.id}`} className="font-medium text-slate-800 hover:text-teal-700">
                        {p.last_name}, {p.first_name}
                      </Link>
                      {p.flags?.blocked && (
                        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">blocked</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-slate-600">{p.phone}</td>
                    <td className="hidden py-2.5 pr-4 text-slate-500 sm:table-cell">{p.email ?? '—'}</td>
                    <td className="hidden py-2.5 pr-4 text-slate-500 md:table-cell">{fmtDate(p.created_at, clinic.timezone)}</td>
                    <td className="py-2.5 text-right">
                      <Link href={`/${clinic.slug}/patients/${p.id}`} className="text-xs font-medium text-teal-600 hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
