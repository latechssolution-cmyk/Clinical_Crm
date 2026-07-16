import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';

let client: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Lazily created so the server can boot (and log
 * warnings) even when SUPABASE_URL / key are not yet configured.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)');
    }
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
