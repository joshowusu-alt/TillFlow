import {
  DEFAULT_BUSINESS_TIMEZONE,
  getBusinessDayBounds,
  resolveBusinessTimeZone,
} from '@/lib/notifications/utils';

import {
  MONEY_RECEIVED_DEFINITION_VERSION,
  type ReportingScopeContext,
} from './types';

export type ResolveMoneyReceivedScopeInput = {
  businessId: string;
  currency: string;
  timeZone?: string | null;
  /** Inclusive calendar start date (business-local day) or absolute instant */
  periodStart: Date;
  /** Inclusive calendar end date (business-local day) or absolute end instant */
  periodEndInclusive: Date;
  branchIds?: string[] | null;
  asOf?: Date;
  /** When true, periodStart/periodEndInclusive are already absolute instants (half-open end exclusive computed from inclusive end-of-day). */
  absoluteBounds?: boolean;
};

/**
 * ReportingScopeClockService for Money Received.
 * Half-open [periodStart, periodEndExclusive) in business timezone day bounds
 * when absoluteBounds is false.
 */
export function resolveMoneyReceivedScope(
  input: ResolveMoneyReceivedScopeInput,
): ReportingScopeContext {
  const timeZone = resolveBusinessTimeZone(input.timeZone ?? DEFAULT_BUSINESS_TIMEZONE);
  const asOf = input.asOf ?? new Date();

  let periodStart: Date;
  let periodEndExclusive: Date;

  if (input.absoluteBounds) {
    periodStart = new Date(input.periodStart);
    // Treat inclusive end as exclusive by adding 1ms after end-of-moment, or if caller
    // already passes exclusive, use as-is when periodEndInclusive equals exclusive.
    periodEndExclusive = new Date(input.periodEndInclusive);
  } else {
    const startBounds = getBusinessDayBounds(input.periodStart, timeZone);
    const endBounds = getBusinessDayBounds(input.periodEndInclusive, timeZone);
    periodStart = startBounds.dayStart;
    periodEndExclusive = endBounds.dayEndExclusive;
  }

  return {
    businessId: input.businessId,
    branchIds: input.branchIds ?? null,
    currency: input.currency,
    timeZone,
    periodStart,
    periodEndExclusive,
    asOf,
    definitionVersion: MONEY_RECEIVED_DEFINITION_VERSION,
  };
}

/** Classify an instant into the business-local calendar day start (UTC instant). */
export function businessLocalDayStart(instant: Date, timeZone?: string | null): Date {
  return getBusinessDayBounds(instant, timeZone).dayStart;
}

export function scopesEqualForReconcile(
  a: ReportingScopeContext,
  b: ReportingScopeContext,
): boolean {
  if (a.businessId !== b.businessId) return false;
  if (a.currency !== b.currency) return false;
  if (a.timeZone !== b.timeZone) return false;
  if (a.periodStart.getTime() !== b.periodStart.getTime()) return false;
  if (a.periodEndExclusive.getTime() !== b.periodEndExclusive.getTime()) return false;
  if (a.definitionVersion !== b.definitionVersion) return false;
  const ab = a.branchIds;
  const bb = b.branchIds;
  if (ab === null && bb === null) return true;
  if (ab === null || bb === null) return false;
  if (ab.length !== bb.length) return false;
  const as = [...ab].sort().join(',');
  const bs = [...bb].sort().join(',');
  return as === bs;
}
