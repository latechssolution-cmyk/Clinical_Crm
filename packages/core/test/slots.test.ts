import { describe, it, expect } from 'vitest';
import { computeOpenSlots, zonedToUtc } from '../src/index.js';
import type { SlotQuery } from '../src/index.js';

const DOC = 'doc-1';

function baseQuery(overrides: Partial<SlotQuery> = {}): SlotQuery {
  return {
    doctorId: DOC,
    timezone: 'UTC',
    // 2026-07-20 is a Monday
    rules: [{ doctorId: DOC, weekday: 1, startTime: '09:00', endTime: '12:00' }],
    exceptions: [],
    appointments: [],
    appointmentType: { id: 't1', durationMinutes: 30, bufferMinutes: 0 },
    fromDate: '2026-07-20',
    toDate: '2026-07-20',
    policy: { minNoticeMinutes: 0, maxAdvanceDays: 365 },
    now: new Date('2026-07-19T00:00:00Z'),
    ...overrides,
  };
}

describe('computeOpenSlots', () => {
  it('discretizes a 9-12 window into 30-min slots', () => {
    const slots = computeOpenSlots(baseQuery());
    expect(slots).toHaveLength(6);
    expect(slots[0]!.startsAt.toISOString()).toBe('2026-07-20T09:00:00.000Z');
    expect(slots[5]!.startsAt.toISOString()).toBe('2026-07-20T11:30:00.000Z');
  });

  it('removes slots overlapping active appointments', () => {
    const slots = computeOpenSlots(baseQuery({
      appointments: [{
        doctorId: DOC, status: 'booked',
        startsAt: new Date('2026-07-20T10:00:00Z'),
        endsAt: new Date('2026-07-20T10:30:00Z'),
      }],
    }));
    expect(slots.map((s) => s.startsAt.toISOString())).not.toContain('2026-07-20T10:00:00.000Z');
    expect(slots).toHaveLength(5);
  });

  it('ignores cancelled appointments', () => {
    const slots = computeOpenSlots(baseQuery({
      appointments: [{
        doctorId: DOC, status: 'cancelled',
        startsAt: new Date('2026-07-20T10:00:00Z'),
        endsAt: new Date('2026-07-20T10:30:00Z'),
      }],
    }));
    expect(slots).toHaveLength(6);
  });

  it('ignores other doctors appointments', () => {
    const slots = computeOpenSlots(baseQuery({
      appointments: [{
        doctorId: 'doc-2', status: 'booked',
        startsAt: new Date('2026-07-20T10:00:00Z'),
        endsAt: new Date('2026-07-20T10:30:00Z'),
      }],
    }));
    expect(slots).toHaveLength(6);
  });

  it('applies whole-day blocked exception', () => {
    const slots = computeOpenSlots(baseQuery({
      exceptions: [{ doctorId: DOC, date: '2026-07-20', kind: 'blocked' }],
    }));
    expect(slots).toHaveLength(0);
  });

  it('applies partial blocked exception and splits the window', () => {
    const slots = computeOpenSlots(baseQuery({
      exceptions: [{ doctorId: DOC, date: '2026-07-20', kind: 'blocked', startTime: '10:00', endTime: '11:00' }],
    }));
    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).toEqual([
      '2026-07-20T09:00:00.000Z',
      '2026-07-20T09:30:00.000Z',
      '2026-07-20T11:00:00.000Z',
      '2026-07-20T11:30:00.000Z',
    ]);
  });

  it('adds extra windows', () => {
    const slots = computeOpenSlots(baseQuery({
      exceptions: [{ doctorId: DOC, date: '2026-07-20', kind: 'extra', startTime: '14:00', endTime: '15:00' }],
    }));
    expect(slots).toHaveLength(8);
    expect(slots.at(-1)!.startsAt.toISOString()).toBe('2026-07-20T14:30:00.000Z');
  });

  it('respects buffer minutes in step and conflict detection', () => {
    const slots = computeOpenSlots(baseQuery({
      appointmentType: { id: 't1', durationMinutes: 30, bufferMinutes: 15 },
    }));
    // 9:00, 9:45, 10:30, 11:15 (11:15+30=11:45 <= 12:00) → 4 slots
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-07-20T09:00:00.000Z',
      '2026-07-20T09:45:00.000Z',
      '2026-07-20T10:30:00.000Z',
      '2026-07-20T11:15:00.000Z',
    ]);
    expect(slots[0]!.endsAt.toISOString()).toBe('2026-07-20T09:30:00.000Z');
  });

  it('enforces min notice', () => {
    const slots = computeOpenSlots(baseQuery({
      now: new Date('2026-07-20T08:00:00Z'),
      policy: { minNoticeMinutes: 120, maxAdvanceDays: 365 },
    }));
    // earliest bookable = 10:00
    expect(slots[0]!.startsAt.toISOString()).toBe('2026-07-20T10:00:00.000Z');
  });

  it('enforces max advance days', () => {
    const slots = computeOpenSlots(baseQuery({
      now: new Date('2026-07-01T00:00:00Z'),
      policy: { minNoticeMinutes: 0, maxAdvanceDays: 10 }, // cutoff = Jul 11
    }));
    expect(slots).toHaveLength(0);
  });

  it('spans multiple days', () => {
    const slots = computeOpenSlots(baseQuery({
      rules: [
        { doctorId: DOC, weekday: 1, startTime: '09:00', endTime: '10:00' },
        { doctorId: DOC, weekday: 2, startTime: '09:00', endTime: '10:00' },
      ],
      fromDate: '2026-07-20',
      toDate: '2026-07-21',
    }));
    expect(slots).toHaveLength(4);
    expect(slots[2]!.startsAt.toISOString()).toBe('2026-07-21T09:00:00.000Z');
  });

  it('converts clinic-local times to UTC (New York, EDT = UTC-4)', () => {
    const slots = computeOpenSlots(baseQuery({ timezone: 'America/New_York' }));
    expect(slots[0]!.startsAt.toISOString()).toBe('2026-07-20T13:00:00.000Z'); // 9am EDT
  });

  it('handles DST transition (New York, Nov 1 2026 fall-back Sunday)', () => {
    const slots = computeOpenSlots(baseQuery({
      timezone: 'America/New_York',
      rules: [{ doctorId: DOC, weekday: 0, startTime: '09:00', endTime: '10:00' }],
      fromDate: '2026-11-01',
      toDate: '2026-11-01',
    }));
    // 9am EST (after fall-back) = 14:00 UTC
    expect(slots[0]!.startsAt.toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });
});

describe('zonedToUtc', () => {
  it('round-trips UTC', () => {
    expect(zonedToUtc('2026-07-20', '09:00', 'UTC').toISOString()).toBe('2026-07-20T09:00:00.000Z');
  });
  it('handles Karachi (UTC+5, no DST)', () => {
    expect(zonedToUtc('2026-07-20', '09:00', 'Asia/Karachi').toISOString()).toBe('2026-07-20T04:00:00.000Z');
  });
});
