import type { Slot, SlotQuery } from './types.js';
import { DEFAULT_BOOKING_POLICY } from './types.js';
import { eachDate, localWeekday, zonedToUtc } from './tz.js';

interface Interval {
  start: number; // epoch ms
  end: number;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Subtract `cut` from each interval in `windows`. */
function subtract(windows: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const w of windows) {
    if (!overlaps(w, cut)) {
      out.push(w);
      continue;
    }
    if (w.start < cut.start) out.push({ start: w.start, end: cut.start });
    if (cut.end < w.end) out.push({ start: cut.end, end: w.end });
  }
  return out;
}

/**
 * Compute open bookable slots for one doctor. Pure function of its inputs —
 * the same code path serves the dashboard and the AI agent, so they can
 * never disagree.
 *
 * Slots are discretized from the start of each availability window in steps
 * of (duration + buffer). A slot conflicts if its busy interval
 * [start, start + duration + buffer) overlaps an active appointment.
 */
export function computeOpenSlots(q: SlotQuery): Slot[] {
  const policy = q.policy ?? DEFAULT_BOOKING_POLICY;
  const now = q.now ?? new Date();
  const durationMs = q.appointmentType.durationMinutes * 60_000;
  const stepMs = (q.appointmentType.durationMinutes + q.appointmentType.bufferMinutes) * 60_000;

  const earliest = now.getTime() + policy.minNoticeMinutes * 60_000;
  const latest = now.getTime() + policy.maxAdvanceDays * 86_400_000;

  const active = q.appointments
    .filter((a) => a.doctorId === q.doctorId && (a.status === 'booked' || a.status === 'confirmed'))
    .map((a) => ({ start: a.startsAt.getTime(), end: a.endsAt.getTime() }));

  const slots: Slot[] = [];

  for (const date of eachDate(q.fromDate, q.toDate)) {
    const weekday = localWeekday(date);

    // 1. base windows from recurring rules
    let windows: Interval[] = q.rules
      .filter((r) => r.doctorId === q.doctorId && r.weekday === weekday)
      .map((r) => ({
        start: zonedToUtc(date, r.startTime, q.timezone).getTime(),
        end: zonedToUtc(date, r.endTime, q.timezone).getTime(),
      }));

    // 2. apply exceptions for this date
    for (const ex of q.exceptions) {
      if (ex.doctorId !== q.doctorId || ex.date !== date) continue;
      if (ex.kind === 'extra' && ex.startTime && ex.endTime) {
        windows.push({
          start: zonedToUtc(date, ex.startTime, q.timezone).getTime(),
          end: zonedToUtc(date, ex.endTime, q.timezone).getTime(),
        });
      } else if (ex.kind === 'blocked') {
        const cut: Interval =
          ex.startTime && ex.endTime
            ? {
                start: zonedToUtc(date, ex.startTime, q.timezone).getTime(),
                end: zonedToUtc(date, ex.endTime, q.timezone).getTime(),
              }
            : { start: zonedToUtc(date, '00:00', q.timezone).getTime(), end: zonedToUtc(date, '00:00', q.timezone).getTime() + 86_400_000 };
        windows = subtract(windows, cut);
      }
    }

    // 3. discretize each window and drop conflicts
    for (const w of windows.sort((a, b) => a.start - b.start)) {
      for (let t = w.start; t + durationMs <= w.end; t += stepMs) {
        if (t < earliest || t > latest) continue;
        const busy: Interval = { start: t, end: t + stepMs };
        if (active.some((a) => overlaps(busy, a))) continue;
        slots.push({
          doctorId: q.doctorId,
          startsAt: new Date(t),
          endsAt: new Date(t + durationMs),
        });
      }
    }
  }

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
