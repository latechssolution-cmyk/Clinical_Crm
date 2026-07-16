import { getClinic } from '@/lib/get-clinic';
import { getIsPlatformAdmin } from '@/lib/platform-admin';
import { signOut } from '@/lib/auth-actions';
import { AppShell } from './shell';

export default async function ClinicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const [{ clinic, user, vertical }, isPlatformAdmin] = await Promise.all([
    getClinic(params.slug),
    getIsPlatformAdmin(),
  ]);

  return (
    <AppShell
      slug={clinic.slug}
      clinicName={clinic.name}
      userEmail={user.email ?? ''}
      navLabels={{
        schedule: vertical.terminology.bookings,
        patients: vertical.terminology.contacts,
      }}
      isPlatformAdmin={isPlatformAdmin}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  );
}
