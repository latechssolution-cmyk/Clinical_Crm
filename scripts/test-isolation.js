// Tenant-isolation + double-booking tests against the LIVE Supabase project.
// Creates two throwaway users/clinics, verifies clinic B can never touch
// clinic A's data, verifies the exclusion constraint under concurrency,
// then cleans everything up.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

async function makeUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'Test-password-123!', email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: session, error: signInErr } = await client.auth.signInWithPassword({
    email, password: 'Test-password-123!',
  });
  if (signInErr) throw new Error(`signIn ${email}: ${signInErr.message}`);
  return { id: data.user.id, client, email };
}

(async () => {
  const stamp = Math.floor(Math.random() * 1e9);
  const cleanup = { users: [], clinics: [] };
  try {
    console.log('Setting up two users + two clinics...');
    const userA = await makeUser(`isolation-a-${stamp}@test.local`);
    const userB = await makeUser(`isolation-b-${stamp}@test.local`);
    cleanup.users.push(userA.id, userB.id);

    const { data: clinicA, error: cErrA } = await userA.client.rpc('create_clinic', {
      p_name: 'Clinic A', p_slug: `clinic-a-${stamp}`, p_timezone: 'UTC' });
    const { data: clinicB, error: cErrB } = await userB.client.rpc('create_clinic', {
      p_name: 'Clinic B', p_slug: `clinic-b-${stamp}`, p_timezone: 'UTC' });
    if (cErrA || cErrB) throw new Error(`create_clinic: ${cErrA?.message || cErrB?.message}`);
    cleanup.clinics.push(clinicA.id, clinicB.id);

    console.log('\n--- Tenancy basics ---');
    check('create_clinic returns clinic', !!clinicA.id && !!clinicB.id);

    const { data: aSeesClinics } = await userA.client.from('clinics').select('id');
    check('A sees exactly own clinic', aSeesClinics?.length === 1 && aSeesClinics[0].id === clinicA.id,
      `saw ${aSeesClinics?.length}`);

    const { data: agentCfgA } = await userA.client.from('agent_configs').select('*').eq('clinic_id', clinicA.id);
    check('default agent_config auto-created', agentCfgA?.length === 1);

    console.log('\n--- Cross-tenant READ isolation ---');
    // A creates a patient; B must not see it
    const { data: patientA, error: pErr } = await userA.client.from('patients').insert({
      clinic_id: clinicA.id, first_name: 'Alice', last_name: 'Test', phone: `+1555${stamp}`.slice(0, 15),
    }).select().single();
    check('A can insert patient in own clinic', !!patientA && !pErr, pErr?.message);

    const { data: bReadsPatients } = await userB.client.from('patients').select('*');
    check('B sees zero of A patients', (bReadsPatients ?? []).every(p => p.clinic_id !== clinicA.id)
      && (bReadsPatients ?? []).length === 0, `saw ${bReadsPatients?.length}`);

    const { data: bReadsClinicA } = await userB.client.from('clinics').select('*').eq('id', clinicA.id);
    check('B cannot read clinic A row', (bReadsClinicA ?? []).length === 0);

    const { data: bReadsCfgA } = await userB.client.from('agent_configs').select('*').eq('clinic_id', clinicA.id);
    check('B cannot read clinic A agent config', (bReadsCfgA ?? []).length === 0);

    const { data: bReadsMembersA } = await userB.client.from('clinic_members').select('*').eq('clinic_id', clinicA.id);
    check('B cannot read clinic A members', (bReadsMembersA ?? []).length === 0);

    console.log('\n--- Cross-tenant WRITE isolation ---');
    const { error: bInsertsIntoA } = await userB.client.from('patients').insert({
      clinic_id: clinicA.id, first_name: 'Mallory', last_name: 'Evil', phone: '+15550001111',
    });
    check('B cannot insert patient into clinic A', !!bInsertsIntoA, 'insert was allowed!');

    const { error: bUpdatesA, data: bUpdData } = await userB.client.from('clinics')
      .update({ name: 'Hacked' }).eq('id', clinicA.id).select();
    check('B cannot update clinic A', (bUpdData ?? []).length === 0);

    const { error: bJoinsA } = await userB.client.from('clinic_members').insert({
      clinic_id: clinicA.id, user_id: userB.id, role: 'owner',
    });
    check('B cannot grant self membership in clinic A', !!bJoinsA, 'membership insert was allowed!');

    console.log('\n--- Anonymous access ---');
    const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: anonClinics } = await anonClient.from('clinics').select('*');
    const { data: anonPatients } = await anonClient.from('patients').select('*');
    check('anon sees no clinics', (anonClinics ?? []).length === 0);
    check('anon sees no patients', (anonPatients ?? []).length === 0);

    console.log('\n--- Double-booking exclusion constraint (concurrency) ---');
    // Setup: doctor in clinic A, two overlapping bookings raced in parallel
    const { data: doctor } = await userA.client.from('doctors').insert({
      clinic_id: clinicA.id, name: 'Dr. Test',
    }).select().single();

    const startsAt = new Date(Date.now() + 7 * 24 * 3600e3);
    const endsAt = new Date(startsAt.getTime() + 30 * 60e3);
    const mkBooking = () => userA.client.from('appointments').insert({
      clinic_id: clinicA.id, doctor_id: doctor.id, patient_id: patientA.id,
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
      status: 'booked', source: 'api',
    }).select();

    const results = await Promise.all(Array.from({ length: 5 }, mkBooking));
    const succeeded = results.filter(r => !r.error && r.data?.length);
    const conflicted = results.filter(r => r.error);
    check('exactly 1 of 5 concurrent overlapping bookings succeeds', succeeded.length === 1,
      `${succeeded.length} succeeded`);
    check('losers get exclusion-constraint error', conflicted.length === 4
      && conflicted.every(r => /no_double_booking|conflicting key/i.test(r.error.message)),
      conflicted[0]?.error?.message);

    // Cancelled appointments free the slot
    const winner = succeeded[0].data[0];
    await userA.client.from('appointments').update({ status: 'cancelled', cancellation_reason: 'test' })
      .eq('id', winner.id);
    const { data: rebook, error: rebookErr } = await mkBooking();
    check('cancelled slot can be rebooked', !!rebook?.length && !rebookErr, rebookErr?.message);

    // Adjacent (non-overlapping) appointment is allowed
    const { error: adjacentErr } = await userA.client.from('appointments').insert({
      clinic_id: clinicA.id, doctor_id: doctor.id, patient_id: patientA.id,
      starts_at: endsAt.toISOString(),
      ends_at: new Date(endsAt.getTime() + 30 * 60e3).toISOString(),
      status: 'booked', source: 'api',
    });
    check('adjacent slot books fine', !adjacentErr, adjacentErr?.message);
  } catch (err) {
    fail++;
    console.error('SETUP/TEST ERROR:', err.message);
  } finally {
    console.log('\nCleaning up...');
    for (const id of cleanup.clinics) await admin.from('clinics').delete().eq('id', id);
    for (const id of cleanup.users) await admin.auth.admin.deleteUser(id);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
