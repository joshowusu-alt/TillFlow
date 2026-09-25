/**
 * Half-open reporting windows in Business.timezone.
 *
 * Intended clock semantics for Wave A. Not stamped authoritative v1.
 * UK DST is not covered here.
 */
import {
  getBusinessCalendarDayBounds,
  getBusinessDayBounds,
  parseBusinessLocalDateKey,
  type LocalDateParts,
} from '@/lib/notifications/utils';

export type HalfOpenWindow = {
  timeZone: string;
  startInclusive: Date;
  endExclusive: Date;
};

export function requireReportTimeZone(timeZone?: string | null): string {
  const trimmed = timeZone?.trim();
  if (!trimmed) throw new Error('Business timezone is required for report windows');
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: trimmed }).format(new Date());
  } catch {
    throw new Error('Business timezone is required for report windows');
  }
  return trimmed;
}

export function businessDayWindow(instant: Date, timeZone: string): HalfOpenWindow {
  const bounds = getBusinessDayBounds(instant, requireReportTimeZone(timeZone));
  return {
    timeZone: bounds.timeZone,
    startInclusive: bounds.dayStart,
    endExclusive: bounds.dayEndExclusive,
  };
}

export function zonedDateTimeParts(instant: Date, timeZone?: string | null): {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: number;
} {
  const zone = requireReportTimeZone(timeZone);
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    weekday: 'short',
  }).formatToParts(instant);
  const part = (type: string) => formatted.find((item) => item.type === type)?.value ?? '0';
  const hourRaw = part('hour');
  const weekdayName = part('weekday');
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName.slice(0, 3));
  return {
    year: Number(part('year')),
    month: Number(part('month')),
    day: Number(part('day')),
    hour: hourRaw === '24' ? 0 : Number(hourRaw),
    weekday: weekdayIndex < 0 ? 0 : weekdayIndex,
  };
}

export function businessLocalDateWindow(
  fromKey: string,
  toKey: string,
  timeZone?: string | null,
): HalfOpenWindow | null {
  const from = parseBusinessLocalDateKey(fromKey);
  const to = parseBusinessLocalDateKey(toKey);
  if (!from || !to) return null;
  const [startParts, endParts] = compareLocalDates(from, to) <= 0 ? [from, to] : [to, from];
  return windowForLocalDates(startParts, endParts, timeZone);
}

export function windowForLocalDates(
  from: LocalDateParts,
  to: LocalDateParts,
  timeZone?: string | null,
): HalfOpenWindow {
  const zone = requireReportTimeZone(timeZone);
  const start = getBusinessCalendarDayBounds(from, zone);
  const end = getBusinessCalendarDayBounds(to, zone);
  return {
    timeZone: zone,
    startInclusive: start.dayStart,
    endExclusive: end.dayEndExclusive,
  };
}

export function instantInHalfOpenWindow(instant: Date, window: HalfOpenWindow): boolean {
  const time = instant.getTime();
  return time >= window.startInclusive.getTime() && time < window.endExclusive.getTime();
}

/** Prisma createdAt / receivedAt filter. End is exclusive. */
export function halfOpenTimestampFilter(window: HalfOpenWindow) {
  return {
    gte: window.startInclusive,
    lt: window.endExclusive,
  };
}

export function addLocalDays(parts: LocalDateParts, days: number): LocalDateParts {
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: probe.getUTCDate(),
  };
}

/** Monday-start business week. End is the next Monday, exclusive. */
/** Calendar month containing `instant`. End is the next local month at 00:00, exclusive. */
export function businessMonthWindow(instant: Date, timeZone: string): HalfOpenWindow {
  const zone = requireReportTimeZone(timeZone);
  const local = getBusinessDayBounds(instant, zone).localDate;
  const start = { year: local.year, month: local.month, day: 1 };
  const nextMonth = local.month === 12
    ? { year: local.year + 1, month: 1, day: 1 }
    : { year: local.year, month: local.month + 1, day: 1 };
  const startBounds = getBusinessCalendarDayBounds(start, zone);
  const endBounds = getBusinessCalendarDayBounds(nextMonth, zone);
  return {
    timeZone: zone,
    startInclusive: startBounds.dayStart,
    endExclusive: endBounds.dayStart,
  };
}

/** Business-local midnight, or the following local midnight when `edge` is exclusive. */
export function localDateInstant(
  key: string | null | undefined,
  edge: 'start' | 'endExclusive',
  timeZone: string,
): Date | undefined {
  const zone = requireReportTimeZone(timeZone);
  const parts = parseBusinessLocalDateKey(key);
  if (!parts) return undefined;
  const bounds = getBusinessCalendarDayBounds(parts, zone);
  return edge === 'start' ? bounds.dayStart : bounds.dayEndExclusive;
}

export function businessWeekWindow(now: Date, timeZone: string, offsetWeeks = 0): HalfOpenWindow {
  const zone = requireReportTimeZone(timeZone);
  const local = getBusinessDayBounds(now, zone).localDate;
  const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  const mondayOffset = (weekday === 0 ? -6 : 1 - weekday) + offsetWeeks * 7;
  const start = addLocalDays(local, mondayOffset);
  const sunday = addLocalDays(start, 6);
  return windowForLocalDates(start, sunday, zone);
}

export function localDateKey(parts: LocalDateParts): string {
  return [
    parts.year,
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

function compareLocalDates(a: LocalDateParts, b: LocalDateParts): number {
  return localDateKey(a).localeCompare(localDateKey(b));
}
