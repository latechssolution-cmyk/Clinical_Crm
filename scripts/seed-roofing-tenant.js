// Seeds a roofing tenant + estimator + availability. Does NOT reassign the
// shared phone number — that's a super-admin flip in the /admin/numbers page.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SLUG = 'skyline-roofing';

(async () => {
  let { data: clinic } = await admin.from('clinics').select('*').eq('slug', SLUG).maybeSingle();
  if (!clinic) {
    ({ data: clinic } = await admin.from('clinics').insert({
      name: 'Skyline Roofing Co.', slug: SLUG,
      timezone: 'America/New_York', default_country: 'US', vertical: 'roofing',
      status: 'active',
      business_hours: {
        mon: [{ open: '08:00', close: '18:00' }],
        tue: [{ open: '08:00', close: '18:00' }],
        wed: [{ open: '08:00', close: '18:00' }],
        thu: [{ open: '08:00', close: '18:00' }],
        fri: [{ open: '08:00', close: '18:00' }],
        sat: [{ open: '09:00', close: '14:00' }],
        sun: [],
      },
    }).select().single());
    console.log('Created tenant:', clinic.name);
  } else {
    console.log('Tenant exists:', clinic.name);
  }

  const { data: cfg } = await admin.from('agent_configs').select('id').eq('clinic_id', clinic.id).maybeSingle();
  if (!cfg) {
    await admin.from('agent_configs').insert({
      clinic_id: clinic.id,
      greeting: 'Thanks for calling Skyline Roofing. Are you calling about a roofing project?',
      voice: 'alloy', language: 'en',
      after_hours_behavior: 'full_service',
      faq: [
        { q: 'What areas do you serve?', a: 'We serve the entire tri-state area.' },
        { q: 'Do you handle insurance claims?', a: 'Yes, we work with all major insurance companies.' },
      ],
      enabled: true,
    });
    console.log('Created agent config');
  }

  let { data: est } = await admin.from('doctors').select('*').eq('clinic_id', clinic.id).eq('name', 'Mike Rivera').maybeSingle();
  if (!est) {
    ({ data: est } = await admin.from('doctors').insert({
      clinic_id: clinic.id, name: 'Mike Rivera', specialty: 'Senior Estimator', active: true,
    }).select().single());
    await admin.from('availability_rules').insert([
      ...[1, 2, 3, 4, 5].map((weekday) => ({
        clinic_id: clinic.id, doctor_id: est.id, weekday,
        start_time: '08:00', end_time: '18:00',
      })),
      // Saturday must match business_hours (sat 09:00-14:00) or the agent
      // announces Saturday hours it can never offer slots for.
      { clinic_id: clinic.id, doctor_id: est.id, weekday: 6, start_time: '09:00', end_time: '14:00' },
    ]);
    console.log('Created estimator:', est.name);
  }

  const { data: types } = await admin.from('appointment_types').select('id').eq('clinic_id', clinic.id);
  if (!types?.length) {
    await admin.from('appointment_types').insert([
      { clinic_id: clinic.id, name: 'Roof Inspection', duration_minutes: 60, buffer_minutes: 15, bookable_by_ai: true },
      { clinic_id: clinic.id, name: 'Emergency Assessment', duration_minutes: 90, buffer_minutes: 30, bookable_by_ai: true },
    ]);
    console.log('Created inspection types');
  }

  console.log('\nSkyline Roofing ready. To route calls to it, visit /admin/numbers and switch +17627016557 -> Skyline Roofing.');
})();
