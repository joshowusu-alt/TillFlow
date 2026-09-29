import type { BusinessPlan } from '@/lib/features';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import type { AppliedRange, RangePreset } from '@/lib/entitlements/types';

/**
 * B.7 / D.5. Calendar arithmetic on tenant-local dates.
 * Day and month steps use UTC calendar fields of an already-resolved
 * local date. They do not subtract elapsed milliseconds from `now`.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) {
    throw new Error('invalid local date');
  }
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return utc.toISOString().slice(0, 10);
}

export function firstOfMonth(isoDate: string): string {
  if (!isIsoDate(isoDate)) {
    throw new Error('invalid local date');
  }
  return `${isoDate.slice(0, 7)}-01`;
}

/** First local day of the month `months` calendar months before `isoDate`'s month. */
export function firstOfMonthMonthsBefore(isoDate: string, months: number): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) {
    throw new Error('invalid local date');
  }
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 - months, 1));
  return utc.toISOString().slice(0, 10);
}

export function inclusiveLocalDateCount(fromLocalDate: string, toLocalDate: string): number {
  if (!isIsoDate(fromLocalDate) || !isIsoDate(toLocalDate) || fromLocalDate > toLocalDate) {
    return 0;
  }
  let count = 0;
  let cursor = fromLocalDate;
  while (cursor <= toLocalDate) {
    count += 1;
    cursor = addCalendarDays(cursor, 1);
  }
  return count;
}

export function todayLocalDate(now: Date, timezone: string): string {
  return formatBusinessLocalDateKey(now, timezone);
}

/** Pro returns null: history is retained. */
export function earliestPermittedLocalDate(plan: BusinessPlan, todayLocal: string): string | null {
  if (plan === 'PRO') return null;
  if (plan === 'GROWTH') return firstOfMonthMonthsBefore(todayLocal, 12);
  return addCalendarDays(todayLocal, -29);
}

/**
 * The date range Command Center asks the entitlement decision to authorise.
 *
 * Displayed trend reads are the 14-local-date negative-margin window and,
 * on Growth and Pro, the tenant calendar month for the linked-supplier card.
 * The 35-local-date expense comparison cannot fit inside Starter's 30-date
 * horizon, and it is not a Command Center metric, so it is not requested.
 * A plan cap never lets this request start before the earliest lawful date.
 */
export function commandCenterRequestedRange(input: {
  plan: BusinessPlan;
  todayLocal: string;
  includeSupplierMonth: boolean;
}): { fromLocalDate: string; toLocalDate: string; preset: 'CUSTOM' } {
  let fromLocalDate = addCalendarDays(input.todayLocal, -14);
  if (input.includeSupplierMonth) {
    const monthStart = firstOfMonth(input.todayLocal);
    if (monthStart < fromLocalDate) fromLocalDate = monthStart;
  }
  const earliest = earliestPermittedLocalDate(input.plan, input.todayLocal);
  if (earliest && fromLocalDate < earliest) fromLocalDate = earliest;
  return { fromLocalDate, toLocalDate: input.todayLocal, preset: 'CUSTOM' };
}

export function clampHrefFor(earliestLocalDate: string): string {
  return `?from=${earliestLocalDate}`;
}

export type RangeResolution =
  | { ok: true; applied: AppliedRange }
  | { ok: false; clampHref?: string };

/**
 * Compare the requested local start with the plan horizon.
 * Month-to-date that does not fit the Starter window is rewritten to the
 * lawful 30-date window and is not a denial.
 */
export function resolveAnalyticalRange(input: {
  plan: BusinessPlan;
  todayLocal: string;
  requested: { fromLocalDate: string; toLocalDate: string; preset?: RangePreset };
}): RangeResolution {
  const earliest = earliestPermittedLocalDate(input.plan, input.todayLocal);

  if (input.requested.preset === 'MONTH_TO_DATE') {
    const monthStart = firstOfMonth(input.todayLocal);
    if (earliest && monthStart < earliest) {
      return {
        ok: true,
        applied: {
          fromLocalDate: earliest,
          toLocalDate: input.todayLocal,
          label: 'Last 30 days',
        },
      };
    }
    return {
      ok: true,
      applied: {
        fromLocalDate: monthStart,
        toLocalDate: input.todayLocal,
        label: 'Month to date',
      },
    };
  }

  const fromLocalDate = input.requested.fromLocalDate;
  const toLocalDate = input.requested.toLocalDate;
  if (!isIsoDate(fromLocalDate) || !isIsoDate(toLocalDate) || fromLocalDate > toLocalDate) {
    return earliest
      ? { ok: false, clampHref: clampHrefFor(earliest) }
      : { ok: false };
  }

  if (earliest && fromLocalDate < earliest) {
    return { ok: false, clampHref: clampHrefFor(earliest) };
  }

  return {
    ok: true,
    applied: {
      fromLocalDate,
      toLocalDate,
      label: input.requested.preset === 'LAST_30_DAYS' ? 'Last 30 days' : 'Custom',
    },
  };
}
