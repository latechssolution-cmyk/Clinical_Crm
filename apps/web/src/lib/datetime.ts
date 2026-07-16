// Clinic-timezone-aware date helpers (Intl only, no deps).

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "YYYY-MM-DD" of an instant in the given timezone. */
export function localDateStr(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function fmtTime(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function fmtDate(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function fmtDateTime(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** Add n days to a "YYYY-MM-DD" string. */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Weekday (0=Sun..6=Sat) of a "YYYY-MM-DD" string (calendar, tz-independent). */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Monday of the week containing dateStr. */
export function mondayOf(dateStr: string): string {
  const wd = weekdayOf(dateStr); // 0=Sun
  const diff = wd === 0 ? -6 : 1 - wd;
  return addDays(dateStr, diff);
}

/** "Mon, Jul 16" style label for a "YYYY-MM-DD". */
export function fmtDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(dt);
}

export function fmtDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Trim "HH:MM:SS" to "HH:MM". */
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '';
}
