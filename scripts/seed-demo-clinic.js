// Seeds a demo clinic mapped to TWILIO_PHONE_NUMBER so the voice agent
// can be tested end-to-end before dashboard signup. Idempotent.
// If OWNER_EMAIL env is set and that user exists, they're added as owner.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SLUG = 'demo-clinic';
const NUMBER = process.env.TWILIO_PHONE_NUMBER;

(async () => {
  if (!NUMBER) throw new Error('TWILIO_PHONE_NUMBER missing in .env');

  let { data: clinic } = await admin.from('clinics').select('*').eq('slug', SLUG).maybeSingle();
  if (!clinic) {
    ({ data: clinic } = await admin.from('clinics').insert({
      name: 'Demo Family Clinic',
      slug: SLUG,
      timezone: 'Asia/Karachi',
      address: '123 Health Street',
      contact_phone: NUMBER,
      status: 'active',
      business_hours: {
        mon: [{ open: '09:00', close: '17:00' }],
        tue: [{ open: '09:00', close: '17:00' }],
        wed: [{ open: '09:00', close: '17:00' }],
        thu: [{ open: '09:00', close: '17:00' }],
        fri: [{ open: '09:00', close: '17:00' }],
        sat: [{ open: '09:00', close: '13:00' }],
        sun: [],
      },
    }).select().single());
    console.log('Created clinic:', clinic.name);
  } else {
    console.log('Clinic exists:', clinic.name);
  }

  // agent config (full service so after-hours never blocks testing)
  const { data: cfg } = await admin.from('agent_configs').select('id').eq('clinic_id', clinic.id).maybeSingle();
  if (!cfg) {
    await admin.from('agent_configs').insert({
      clinic_id: clinic.id,
      greeting: 'Thank you for calling Demo Family Clinic. This is the virtual receptionist — how can I help you today?',
      voice: 'alloy',
      language: 'en',
      after_hours_behavior: 'full_service',
      faq: [
        { q: 'Where are you located?', a: '123 Health Street.' },
        { q: 'Do you accept walk-ins?', a: 'We prefer appointments, but walk-ins are seen when possible.' },
      ],
      enabled: true,
    });
    console.log('Created agent config');
  }

  let { data: doctor } = await admin.from('doctors').select('*').eq('clinic_id', clinic.id).eq('name', 'Dr. Sarah Ahmed').maybeSingle();
  if (!doctor) {
    ({ data: doctor } = await admin.from('doctors').insert({
      clinic_id: clinic.id, name: 'Dr. Sarah Ahmed', specialty: 'General Practice', active: true,
    }).select().single());
    // Mon-Sat 9-17 availability
    await admin.from('availability_rules').insert(
      [1, 2, 3, 4, 5, 6].map((weekday) => ({
        clinic_id: clinic.id, doctor_id: doctor.id, weekday,
        start_time: '09:00', end_time: weekday === 6 ? '13:00' : '17:00',
      })),
    );
    console.log('Created doctor + availability:', doctor.name);
  }

  const { data: types } = await admin.from('appointment_types').select('id').eq('clinic_id', clinic.id);
  if (!types?.length) {
    await admin.from('appointment_types').insert([
      { clinic_id: clinic.id, name: 'General Consultation', duration_minutes: 30, buffer_minutes: 0, bookable_by_ai: true },
      { clinic_id: clinic.id, name: 'Follow-up Visit', duration_minutes: 15, buffer_minutes: 0, bookable_by_ai: true },
    ]);
    console.log('Created appointment types');
  }

  const { data: phone } = await admin.from('phone_numbers').select('id').eq('number', NUMBER).maybeSingle();
  if (!phone) {
    await admin.from('phone_numbers').insert({
      clinic_id: clinic.id, number: NUMBER, provider: 'twilio', is_primary: true,
    });
    console.log('Mapped number', NUMBER, '-> clinic');
  } else {
    console.log('Number already mapped');
  }

  if (process.env.OWNER_EMAIL) {
    const { data: users } = await admin.auth.admin.listUsers();
    const user = users?.users?.find((u) => u.email === process.env.OWNER_EMAIL);
    if (user) {
      await admin.from('clinic_members').upsert(
        { clinic_id: clinic.id, user_id: user.id, role: 'owner' },
        { onConflict: 'clinic_id,user_id' },
      );
      console.log('Added owner:', user.email);
    } else {
      console.log(`No auth user with email ${process.env.OWNER_EMAIL} yet — sign up in the dashboard first, then re-run.`);
    }
  }

  console.log('\nDemo clinic ready. Call', NUMBER);
})();
