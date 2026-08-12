import {
  formatBusinessLocalDateKey,
  getBusinessCalendarDayBounds,
  getBusinessDayBounds,
  parseBusinessLocalDateKey,
  resolveBusinessTimeZone,
  type LocalDateParts,
} from '@/lib/notifications/utils';

import type { BusinessMovementPeriodPair } from './types';

function addLocalMonths(parts: LocalDateParts, months: number): LocalDateParts {
  const probe = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
  return {
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: 1,
  };
}

function lastDayOfLocalMonth(parts: LocalDateParts): LocalDateParts {
  const probe = new Date(Date.UTC(parts.year, parts.month, 0));
  return {
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: probe.getUTCDate(),
  };
}

function localDateKey(parts: LocalDateParts): string {
  return [
    parts.year,
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

function daysBetweenInclusive(from: LocalDateParts, to: LocalDateParts): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.floor((b - a) / 86_400_000) + 1;
}

function addLocalDays(parts: LocalDateParts, days: number): LocalDateParts {
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: probe.getUTCDate(),
  };
}

function monthWindow(year: number, month: number, timeZone: string) {
  const startLocal: LocalDateParts = { year, month, day: 1 };
  const nextMonth = addLocalMonths(startLocal, 1);
  const start = getBusinessCalendarDayBounds(startLocal, timeZone);
  const end = getBusinessCalendarDayBounds(nextMonth, timeZone);
  const lastDay = lastDayOfLocalMonth(startLocal);
  return {
    start: start.dayStart,
    endExclusive: end.dayStart,
    fromKey: localDateKey(startLocal),
    toKey: localDateKey(lastDay),
  };
}

/**
 * Default MoM pair: last full calendar month vs the month before it,
 * in the business timezone (not server-local).
 *
 * Example: asOf mid-August Accra → current = July, comparison = June.
 */
export function resolveLastFullCalendarMonthPair(input: {
  timeZone?: string | null;
  asOf?: Date;
}): BusinessMovementPeriodPair {
  const timeZone = resolveBusinessTimeZone(input.timeZone);
  const asOf = input.asOf ?? new Date();
  const todayLocal = getBusinessDayBounds(asOf, timeZone).localDate;
  const thisMonthStart = { year: todayLocal.year, month: todayLocal.month, day: 1 };
  const currentMonthStart = addLocalMonths(thisMonthStart, -1);
  const comparisonMonthStart = addLocalMonths(thisMonthStart, -2);

  const current = monthWindow(currentMonthStart.year, currentMonthStart.month, timeZone);
  const comparison = monthWindow(
    comparisonMonthStart.year,
    comparisonMonthStart.month,
    timeZone,
  );

  return {
    timeZone,
    currentStart: current.start,
    currentEndExclusive: current.endExclusive,
    comparisonStart: comparison.start,
    comparisonEndExclusive: comparison.endExclusive,
    currentFromKey: current.fromKey,
    currentToKey: current.toKey,
    comparisonFromKey: comparison.fromKey,
    comparisonToKey: comparison.toKey,
    preset: 'last_full_calendar_month',
  };
}

/**
 * Equal-length custom window: comparison is the same number of local days
 * immediately before the current inclusive range.
 */
export function resolveEqualLengthPeriodPair(input: {
  timeZone?: string | null;
  /** Inclusive business-local YYYY-MM-DD */
  currentFromKey: string;
  currentToKey: string;
}): BusinessMovementPeriodPair {
  const timeZone = resolveBusinessTimeZone(input.timeZone);
  const from = parseBusinessLocalDateKey(input.currentFromKey);
  const to = parseBusinessLocalDateKey(input.currentToKey);
  if (!from || !to) {
    throw new Error('Invalid currentFromKey/currentToKey for business movement period');
  }
  const ordered = localDateKey(from) <= localDateKey(to) ? { from, to } : { from: to, to: from };
  const lengthDays = daysBetweenInclusive(ordered.from, ordered.to);
  const comparisonTo = addLocalDays(ordered.from, -1);
  const comparisonFrom = addLocalDays(comparisonTo, -(lengthDays - 1));

  const currentStart = getBusinessCalendarDayBounds(ordered.from, timeZone).dayStart;
  const currentEndExclusive = getBusinessCalendarDayBounds(ordered.to, timeZone).dayEndExclusive;
  const comparisonStart = getBusinessCalendarDayBounds(comparisonFrom, timeZone).dayStart;
  const comparisonEndExclusive = getBusinessCalendarDayBounds(comparisonTo, timeZone)
    .dayEndExclusive;

  return {
    timeZone,
    currentStart,
    currentEndExclusive,
    comparisonStart,
    comparisonEndExclusive,
    currentFromKey: localDateKey(ordered.from),
    currentToKey: localDateKey(ordered.to),
    comparisonFromKey: localDateKey(comparisonFrom),
    comparisonToKey: localDateKey(comparisonTo),
    preset: 'equal_length_custom',
  };
}

/** Debug/helper: business-local parts for an instant. */
export function businessLocalParts(instant: Date, timeZone?: string | null): LocalDateParts {
  return getBusinessDayBounds(instant, timeZone).localDate;
}

export function formatPeriodChromeKey(instant: Date, timeZone?: string | null): string {
  return formatBusinessLocalDateKey(instant, timeZone);
}
