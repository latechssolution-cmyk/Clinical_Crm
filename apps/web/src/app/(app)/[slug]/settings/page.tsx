import { getClinic } from '@/lib/get-clinic';
import { GeneralForm } from './general-form';

export const dynamic = 'force-dynamic';

export default async function GeneralSettingsPage({ params }: { params: { slug: string } }) {
  const { clinic, role } = await getClinic(params.slug);
  return <GeneralForm clinic={clinic} canEdit={role === 'owner'} />;
}
