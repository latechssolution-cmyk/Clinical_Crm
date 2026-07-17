import { getClinic } from '@/lib/get-clinic';
import { SettingsNav } from './settings-nav';

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const { clinic, vertical } = await getClinic(params.slug);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
      <SettingsNav
        slug={clinic.slug}
        providersLabel={vertical.terminology.providers}
        bookingLabel={vertical.terminology.booking}
      />
      <div>{children}</div>
    </div>
  );
}
