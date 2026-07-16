import { getClinic } from '@/lib/get-clinic';
import { createClient } from '@/lib/supabase/server';
import type { AgentConfig } from '@/lib/types';
import { AiForm } from './ai-form';

export const dynamic = 'force-dynamic';

export default async function AiSettingsPage({ params }: { params: { slug: string } }) {
  const { clinic, role } = await getClinic(params.slug);
  const supabase = createClient();

  const { data } = await supabase
    .from('agent_configs')
    .select('*')
    .eq('clinic_id', clinic.id)
    .maybeSingle();

  if (!data) {
    return (
      <p className="text-sm text-slate-500">
        No AI receptionist configuration found for this clinic.
      </p>
    );
  }

  return <AiForm slug={clinic.slug} config={data as AgentConfig} canEdit={role === 'owner'} />;
}
