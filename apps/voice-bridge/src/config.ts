import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load env: repo root .env first, then a local apps/voice-bridge/.env (if present)
// may override for local development.
const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..'); // apps/voice-bridge
const repoRoot = path.resolve(appRoot, '..', '..'); // repo root

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(appRoot, '.env'), override: true });

export interface Config {
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  twilioAuthToken: string;
  twilioAccountSid: string;
  /** Twilio number to send SMS confirmations from. Empty = SMS disabled. */
  twilioPhoneNumber: string;
  openaiApiKey: string;
  /** Public https base URL (e.g. ngrok tunnel). Empty in dev until set. */
  publicBaseUrl: string;
  openaiRealtimeModel: string;
  summaryModel: string;
}

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

export const config: Config = {
  port: Number(env('PORT') || 8080),
  supabaseUrl: env('SUPABASE_URL'),
  supabaseServiceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  twilioAuthToken: env('TWILIO_AUTH_TOKEN'),
  twilioAccountSid: env('TWILIO_ACCOUNT_SID'),
  twilioPhoneNumber: env('TWILIO_PHONE_NUMBER'),
  openaiApiKey: env('OPENAI_API_KEY'),
  publicBaseUrl: env('PUBLIC_BASE_URL').replace(/\/+$/, ''),
  openaiRealtimeModel: env('OPENAI_REALTIME_MODEL') || 'gpt-realtime',
  summaryModel: env('OPENAI_SUMMARY_MODEL') || 'gpt-4o-mini',
};

/** Log (but do not crash on) missing environment variables at startup. */
export function warnMissingEnv(): void {
  const required: Array<[string, string, string]> = [
    ['SUPABASE_URL', config.supabaseUrl, 'database access will fail'],
    ['SUPABASE_SERVICE_ROLE_KEY', config.supabaseServiceRoleKey, 'database access will fail'],
    ['TWILIO_AUTH_TOKEN', config.twilioAuthToken, 'webhook signature validation disabled'],
    ['TWILIO_ACCOUNT_SID', config.twilioAccountSid, 'REST hangup disabled'],
    ['OPENAI_API_KEY', config.openaiApiKey, 'AI sessions cannot start'],
    ['PUBLIC_BASE_URL', config.publicBaseUrl, 'signature validation skipped (dev mode)'],
  ];
  const missing = required.filter(([, v]) => !v);
  if (missing.length > 0) {
    console.warn(
      '[config] WARNING — missing environment variables:\n' +
        missing.map(([name, , impact]) => `  - ${name} (${impact})`).join('\n'),
    );
  } else {
    console.log('[config] all expected environment variables present');
  }
}
