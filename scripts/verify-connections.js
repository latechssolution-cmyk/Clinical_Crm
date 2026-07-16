require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');
const { Client: PgClient } = require('pg');

async function checkSupabase() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY);
  const { error } = await supabase.from('__connection_check__').select('*').limit(1);
  if (error && error.code !== 'PGRST205') throw new Error(`Supabase REST: ${error.message}`);
  console.log('Supabase REST/Auth API: OK');
}

async function checkDatabase() {
  const client = new PgClient({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('select 1');
  await client.end();
  console.log('Supabase Postgres (pooler): OK');
}

async function checkTwilio() {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const account = await client.api.v2010.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
  console.log(`Twilio: OK (account status: ${account.status})`);
}

(async () => {
  let failed = false;
  for (const [name, fn] of Object.entries({ Supabase: checkSupabase, Database: checkDatabase, Twilio: checkTwilio })) {
    try {
      await fn();
    } catch (err) {
      failed = true;
      console.error(`${name}: FAILED - ${err.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
