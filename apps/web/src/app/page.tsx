import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function RootPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: memberships } = await supabase
    .from('clinic_members')
    .select('clinic_id, clinics(slug)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1);

  const first = memberships?.[0] as { clinics: { slug: string } | { slug: string }[] | null } | undefined;
  const clinics = first?.clinics;
  const slug = Array.isArray(clinics) ? clinics[0]?.slug : clinics?.slug;

  if (!slug) redirect('/onboarding');
  redirect(`/${slug}`);
}
