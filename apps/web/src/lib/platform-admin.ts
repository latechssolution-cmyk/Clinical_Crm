import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * True when the current user has a row in platform_admins.
 * RLS only lets a user see their own row, so a plain select suffices.
 */
export const getIsPlatformAdmin = cache(async (): Promise<boolean> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return !!data;
});

/** Gate for /admin — redirects non-admins away. Returns the admin user. */
export const requirePlatformAdmin = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) redirect('/');
  return user;
});
