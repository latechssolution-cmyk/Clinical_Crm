// One-off audit: compute open slots for Skyline Roofing from LIVE data and
// verify booking-flow invariants (Saturday coverage, buffers, min-notice,
// off-grid rejection). Run: npx tsx scripts/audit-roofing-slots.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeOpenSlots, type AvailabilityRule, type AvailabilityException, type ExistingAppointment } from '@clinical-crm/core';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

(async () => {
  const { data: clinic } = await db.from('clinics').select('*').eq('slug', 'skyline-roofing').single();
  const { data: est } = await db.from('doctors').select('id, name').eq('clinic_id', clinic.id).eq('name', 'Mike Rivera').single();
  const { data: types } = await db.from('appointment_types').select('*').eq('clinic_id', clinic.id).eq('active', true);
  const inspection = types!.find((t) => t.name === 'Roof Inspection')!;

  const tz = clinic.timezone as string;
  const from = localDate(new Date(), tz);
  const to = localDate(new Date(Date.now() + 8 * 86_400_000), tz);

  const [rulesRes, excRes, apptsRes] = await Promise.all([
    db.from('availability_rules').select('*').eq('clinic_id', clinic.id).eq('doctor_id', est!.id),
    db.from('availability_exceptions').select('*').eq('clinic_id', clinic.id).eq('doctor_id', est!.id).gte('date', from).lte('date', to),
    db.from('appointments').select('doctor_id, starts_at, ends_at, status').eq('clinic_id', clinic.id).eq('doctor_id', est!.id).in('status', ['booked', 'confirmed']),
  ]);

  const rules: AvailabilityRule[] = rulesRes.data!.map((r) => ({
    doctorId: r.doctor_id, weekday: r.weekday,
    startTime: String(r.start_time).slice(0, 5), endTime: String(r.end_time).slice(0, 5),
  }));
  const exceptions: AvailabilityException[] = (excRes.data ?? []).map((e) => ({
    doctorId: e.doctor_id, date: e.date, kind: e.kind,
    startTime: e.start_time ? String(e.start_time).slice(0, 5) : null,
    endTime: e.end_time ? String(e.end_time).slice(0, 5) : null,
  }));
  const appointments: ExistingAppointment[] = (apptsRes.data ?? []).map((a) => ({
    doctorId: a.doctor_id, startsAt: new Date(a.starts_at), endsAt: new Date(a.ends_at), status: a.status,
  }));

  const bp = { minNoticeMinutes: 120, maxAdvanceDays: 60 };
  const slots = computeOpenSlots({
    doctorId: est!.id, timezone: tz, rules, exceptions, appointments,
    appointmentType: { id: inspection.id, durationMinutes: inspection.duration_minutes, bufferMinutes: inspection.buffer_minutes },
    fromDate: from, toDate: to, policy: bp,
  });

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);

  console.log(`Slots for ${inspection.name} (${inspection.duration_minutes}+${inspection.buffer_minutes}m buffer), ${from} → ${to}: ${slots.length} total`);
  const byDay = new Map<string, number>();
  for (const s of slots) {
    const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(s.startsAt);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  console.log('Per weekday:', Object.fromEntries(byDay));
  console.log('First 3:', slots.slice(0, 3).map((s) => fmt(s.startsAt)).join(' | '));

  // Invariant checks
  let pass = 0, fail = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
    ok ? pass++ : fail++;
  };

  check('Saturday slots now offered', (byDay.get('Sat') ?? 0) > 0, `${byDay.get('Sat') ?? 0} Sat slots`);
  check('No Sunday slots (closed)', (byDay.get('Sun') ?? 0) === 0);

  const now = Date.now();
  check('Min-notice honored (no slot within 120min)', slots.every((s) => s.startsAt.getTime() >= now + 120 * 60_000));

  // No offered slot may overlap an existing appointment INCLUDING the candidate's trailing buffer
  const stepMs = (inspection.duration_minutes + inspection.buffer_minutes) * 60_000;
  const overlaps = slots.filter((s) =>
    appointments.some((a) => s.startsAt.getTime() < a.endsAt.getTime() && a.startsAt.getTime() < s.startsAt.getTime() + stepMs),
  );
  check('No slot collides with booked appointment (+buffer)', overlaps.length === 0, overlaps.length ? fmt(overlaps[0].startsAt) : '');

  // Off-grid probe: a time 7 minutes after a real slot must NOT be in the offered set
  if (slots.length > 0) {
    const offGrid = new Date(slots[0].startsAt.getTime() + 7 * 60_000);
    check('Off-grid time is not an offered slot (book/reschedule would reject it)',
      !slots.some((s) => s.startsAt.getTime() === offGrid.getTime()), fmt(offGrid));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
