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
  resolveBusinessTimeZone,
  type LocalDateParts,
} from '@/lib/notifications/utils';

export type HalfOpenWindow = {
  timeZone: string;
  startInclusive: Date;
  endExclusive: Date;
};

export function businessDayWindow(instant: Date, timeZone?: string | null): HalfOpenWindow {
  const bounds = getBusinessDayBounds(instant, timeZone);
  return {
    timeZone: bounds.timeZone,
    startInclusive: bounds.dayStart,
    endExclusive: bounds.dayEndExclusive,
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
  const zone = resolveBusinessTimeZone(timeZone);
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
export function businessWeekWindow(now: Date, timeZone?: string | null, offsetWeeks = 0): HalfOpenWindow {
  const zone = resolveBusinessTimeZone(timeZone);
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
