// Applies supabase/migrations/*.sql in order, tracking applied migrations
// in public._migrations. Uses the session-mode pooler (DDL-safe).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL_SESSION,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(`
      create table if not exists public._migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )`);

    const { rows } = await client.query('select name from public._migrations');
    const applied = new Set(rows.map((r) => r.name));

    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`Applying ${file}...`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into public._migrations (name) values ($1)', [file]);
        await client.query('commit');
        ran++;
      } catch (err) {
        await client.query('rollback');
        console.error(`FAILED in ${file}: ${err.message}`);
        process.exit(1);
      }
    }
    console.log(ran === 0 ? 'Nothing to apply — up to date.' : `Applied ${ran} migration(s).`);
  } finally {
    await client.end();
  }
})();
