/**
 * Storefront opening-hours model + open/closed status logic.
 *
 * Hours are stored as a JSON string on `Business.storefrontHoursJson` shaped as
 * `Record<DayKey, { open: 'HH:MM'; close: 'HH:MM'; closed?: boolean }>`.
 * Times are interpreted in the business timezone (Business.timezone, e.g.
 * 'Africa/Accra'). Computation runs in UTC and projects the supplied `now`
 * into the business timezone to read its weekday and clock minutes.
 */

export const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export type DayHours = {
  open: string; // 'HH:MM' 24-hour
  close: string;
  closed?: boolean;
};

export type WeeklyHours = Record<DayKey, DayHours>;

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function makeDefaultWeeklyHours(): WeeklyHours {
  return DAY_KEYS.reduce<WeeklyHours>((acc, day) => {
    acc[day] = { open: '08:00', close: '20:00', closed: day === 'sunday' };
    return acc;
  }, {} as WeeklyHours);
}

export function parseWeeklyHours(value: string | null | undefined): WeeklyHours | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const out = {} as WeeklyHours;
    for (const day of DAY_KEYS) {
      const raw = (parsed as Record<string, unknown>)[day];
      if (!raw || typeof raw !== 'object') {
        out[day] = { open: '08:00', close: '20:00', closed: true };
        continue;
      }
      const obj = raw as Record<string, unknown>;
      const open = typeof obj.open === 'string' && HHMM_PATTERN.test(obj.open) ? obj.open : '08:00';
      const close = typeof obj.close === 'string' && HHMM_PATTERN.test(obj.close) ? obj.close : '20:00';
      const closed = Boolean(obj.closed);
      out[day] = { open, close, closed };
    }
    return out;
  } catch {
    return null;
  }
}

export function serializeWeeklyHours(hours: WeeklyHours): string {
  return JSON.stringify(hours);
}

function hhmmToMinutes(value: string) {
  const [h, m] = value.split(':').map((p) => parseInt(p, 10));
  return h * 60 + m;
}

function minutesToHhmm(minutes: number) {
  const safe = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatHumanTime(value: string) {
  const minutes = hhmmToMinutes(value);
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? 'pm' : 'am';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  if (m === 0) return `${h12}${period}`;
  return `${h12}:${String(m).padStart(2, '0')}${period}`;
}

/**
 * Project a Date into a target IANA timezone and return the day-of-week + the
 * minutes-since-midnight clock value. Uses Intl with explicit options so it
 * works in Node 18+ and the V8 runtime on Vercel.
 */
function projectIntoTimezone(now: Date, timeZone: string): { dayKey: DayKey; minutesSinceMidnight: number } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase() ?? 'mon';
  const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minutePart = parts.find((p) => p.type === 'minute')?.value ?? '00';

  const map: Record<string, DayKey> = {
    mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday',
    fri: 'friday', sat: 'saturday', sun: 'sunday',
  };

  return {
    dayKey: map[weekday] ?? 'monday',
    minutesSinceMidnight: parseInt(hourPart, 10) * 60 + parseInt(minutePart, 10),
  };
}

function nextDayKey(day: DayKey): DayKey {
  const idx = DAY_KEYS.indexOf(day);
  return DAY_KEYS[(idx + 1) % DAY_KEYS.length];
}

export type OpenStatus = {
  isOpen: boolean;
  /** Short label suitable for a chip e.g. "Open now", "Closed". */
  shortLabel: string;
  /** Detail line e.g. "Ready in ~30 min" or "Opens 8am Monday". */
  detail: string | null;
};

export function getOpenStatus(args: {
  hours: WeeklyHours | null;
  timezone?: string | null;
  pickupPrepMinutes?: number | null;
  now?: Date;
}): OpenStatus | null {
  if (!args.hours) return null;
  const tz = args.timezone || 'Africa/Accra';
  const now = args.now ?? new Date();
  const { dayKey, minutesSinceMidnight } = projectIntoTimezone(now, tz);

  const today = args.hours[dayKey];
  if (today && !today.closed) {
    const openMin = hhmmToMinutes(today.open);
    const closeMin = hhmmToMinutes(today.close);
    if (minutesSinceMidnight >= openMin && minutesSinceMidnight < closeMin) {
      const prep = Math.max(args.pickupPrepMinutes ?? 0, 0);
      return {
        isOpen: true,
        shortLabel: 'Open now',
        detail: prep > 0 ? `Ready in ~${prep} min` : null,
      };
    }
    if (minutesSinceMidnight < openMin) {
      return {
        isOpen: false,
        shortLabel: 'Closed',
        detail: `Opens at ${formatHumanTime(today.open)}`,
      };
    }
  }

  // Find next open day in the week
  let cursor = nextDayKey(dayKey);
  for (let i = 0; i < 7; i += 1) {
    const candidate = args.hours[cursor];
    if (candidate && !candidate.closed) {
      return {
        isOpen: false,
        shortLabel: 'Closed',
        detail: `Opens at ${formatHumanTime(candidate.open)} ${DAY_LABELS[cursor]}`,
      };
    }
    cursor = nextDayKey(cursor);
  }

  return {
    isOpen: false,
    shortLabel: 'Closed',
    detail: 'Hours not set',
  };
}
