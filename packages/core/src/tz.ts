// Minimal timezone conversion without external deps, via Intl.
// Converts a clinic-local wall-clock time to a UTC instant, DST-aware.

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getDtf(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

/** Milliseconds offset of `timeZone` from UTC at the given instant. */
function tzOffsetMs(timeZone: string, instant: Date): number {
  const parts = getDtf(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Convert clinic-local date ("YYYY-MM-DD") + time ("HH:MM") in `timeZone`
 * to a UTC Date. Two-pass to handle DST transitions.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  let offset = tzOffsetMs(timeZone, new Date(naive));
  offset = tzOffsetMs(timeZone, new Date(naive - offset));
  return new Date(naive - offset);
}

/** Clinic-local weekday (0=Sunday..6=Saturday) of a "YYYY-MM-DD" local date. */
export function localWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  // weekday of a calendar date is timezone-independent when treated as pure date
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Enumerate "YYYY-MM-DD" dates from `from` (inclusive) to `to` (inclusive). */
export function* eachDate(from: string, to: string): Generator<string> {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cur.getTime() <= end.getTime()) {
    yield cur.toISOString().slice(0, 10);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}
