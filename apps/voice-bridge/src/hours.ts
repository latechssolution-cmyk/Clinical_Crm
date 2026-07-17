// Business-hours evaluation against clinics.business_hours (jsonb).
//
// Accepted shapes (per weekday key):
//   { "mon": [{ "open": "09:00", "close": "17:00" }], "sun": [] , ... }
//   { "monday": { "open": "09:00", "close": "17:00" }, ... }
//   { "1": [{ "open": ..., "close": ... }] }            // 0=Sunday..6=Saturday
// A missing/empty/null entry means closed that day. An empty business_hours
// object means "no hours configured" → treated as always open.

const DAY_KEYS: string[][] = [
  ['0', 'sun', 'sunday'],
  ['1', 'mon', 'monday'],
  ['2', 'tue', 'tuesday'],
  ['3', 'wed', 'wednesday'],
  ['4', 'thu', 'thursday'],
  ['5', 'fri', 'friday'],
  ['6', 'sat', 'saturday'],
];

interface OpenWindow {
  open: string; // "HH:MM"
  close: string;
}

function toWindows(raw: unknown): OpenWindow[] {
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: OpenWindow[] = [];
  for (const item of items) {
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      // The dashboard stores closed days as { closed: true, open, close } —
      // the retained open/close must not count as an open window.
      if (o.closed === true) continue;
      const open = typeof o.open === 'string' ? o.open : typeof o.start === 'string' ? o.start : null;
      const close = typeof o.close === 'string' ? o.close : typeof o.end === 'string' ? o.end : null;
      if (open && close) out.push({ open, close });
    }
  }
  return out;
}

/** Current weekday (0=Sun..6=Sat) and "HH:MM" wall clock in `timezone`. */
export function localNow(timezone: string, now = new Date()): { weekday: number; time: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { weekday: weekday < 0 ? 0 : weekday, time: `${hour}:${get('minute')}` };
}

/** Is the clinic currently within business hours (clinic-local)? */
export function isWithinBusinessHours(
  businessHours: Record<string, unknown>,
  timezone: string,
  now = new Date(),
): boolean {
  if (!businessHours || Object.keys(businessHours).length === 0) return true; // not configured
  const { weekday, time } = localNow(timezone, now);
  const keys = DAY_KEYS[weekday] ?? [];
  for (const key of keys) {
    if (key in businessHours) {
      const windows = toWindows(businessHours[key]);
      return windows.some((w) => w.open <= time && time < w.close);
    }
  }
  return false; // hours configured but nothing for today → closed
}

/** Human-readable weekly hours for TwiML <Say> / agent instructions. */
export function describeBusinessHours(businessHours: Record<string, unknown>): string {
  if (!businessHours || Object.keys(businessHours).length === 0) return '';
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const lines: string[] = [];
  for (let d = 0; d < 7; d++) {
    const keys = DAY_KEYS[d] ?? [];
    const key = keys.find((k) => k in businessHours);
    if (key === undefined) continue;
    const windows = toWindows(businessHours[key]);
    lines.push(
      windows.length === 0
        ? `${names[d]}: closed`
        : `${names[d]}: ${windows.map((w) => `${w.open} to ${w.close}`).join(', ')}`,
    );
  }
  return lines.join('. ');
}
