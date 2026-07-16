import { getClinic } from '@/lib/get-clinic';
import { signOut } from '@/lib/auth-actions';
import { AppShell } from './shell';

export default async function ClinicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const { clinic, user } = await getClinic(params.slug);

  return (
    <AppShell
      slug={clinic.slug}
      clinicName={clinic.name}
      userEmail={user.email ?? ''}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  );
}
