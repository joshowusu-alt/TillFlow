import { describe, expect, it } from 'vitest';
import { computeBusinessMovementWithMoneyFromDb } from '@/lib/reports/business-movement/money-compose';
import { computeSalesComparisonFromDb } from '@/lib/reports/business-movement/query';
import {
  resolveEqualLengthPeriodPair,
  resolveLastFullCalendarMonthPair,
} from '@/lib/reports/business-movement/periods';
import { businessLocalDayStart } from '@/lib/reports/money-received/scope-clock';
import { resolveReportingScope } from '@/lib/reports/reporting-scope';

/**
 * 2026-06-30T22:00:00.000Z is 30 Jun 22:00 in Accra and 1 Jul 01:00 in Nairobi.
 * Nairobi local midnight on 1 Jul is 2026-06-30T21:00:00.000Z.
 */
const BOUNDARY = new Date('2026-06-30T22:00:00.000Z');
const NAIROBI_DAY_START = '2026-06-30T21:00:00.000Z';
const REQUIRED = 'Business timezone is required for report windows';
const BAD_ZONES = [undefined, null, '', '   ', 'Mars/Olympus'] as const;

function zoneOutcome(run: () => { timeZone: string }) {
  try {
    return { threw: false as const, timeZone: run().timeZone };
  } catch (error) {
    return {
      threw: true as const,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function instantOutcome(run: () => Date) {
  try {
    return { threw: false as const, instant: run().toISOString() };
  } catch (error) {
    return {
      threw: true as const,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function queryGuard() {
  const queries: string[] = [];
  const db = new Proxy({} as object, {
    get(_target, model) {
      if (typeof model === 'symbol') return undefined;
      return new Proxy({} as object, {
        get(_inner, method) {
          if (typeof method === 'symbol') return undefined;
          return async () => {
            queries.push(`${String(model)}.${String(method)}`);
            throw new Error(`queried ${String(model)}.${String(method)} before timezone validation`);
          };
        },
      });
    },
  });
  return { db: db as never, queries };
}

describe('A7 resolveReportingScope does not fall back to Africa/Accra', () => {
  function resolve(timeZone?: string | null) {
    return resolveReportingScope({
      businessId: 'biz-1',
      timeZone,
      params: { period: 'today', storeId: 'ALL' },
      defaultPeriod: 'today',
      allowedStoreIds: [],
      now: BOUNDARY,
    });
  }

  it.each(BAD_ZONES)('rejects %s', (timeZone) => {
    expect(zoneOutcome(() => resolve(timeZone))).toEqual({ threw: true, message: REQUIRED });
  });

  it('preserves Africa/Nairobi and its half-open local day', () => {
    const scope = resolve('Africa/Nairobi');
    expect(scope.timeZone).toBe('Africa/Nairobi');
    expect(scope.startInclusive.toISOString()).toBe(NAIROBI_DAY_START);
    expect(scope.endExclusive.toISOString()).toBe('2026-07-01T21:00:00.000Z');
    expect(scope.startInclusive.getTime()).toBeLessThan(BOUNDARY.getTime());
    expect(BOUNDARY.getTime()).toBeLessThan(scope.endExclusive.getTime());
  });
});

describe('A7 Business Movement periods do not fall back to Africa/Accra', () => {
  it.each(BAD_ZONES)('resolveLastFullCalendarMonthPair rejects %s', (timeZone) => {
    expect(zoneOutcome(() => resolveLastFullCalendarMonthPair({ timeZone, asOf: BOUNDARY }))).toEqual({
      threw: true,
      message: REQUIRED,
    });
  });

  it.each(BAD_ZONES)('resolveEqualLengthPeriodPair rejects %s', (timeZone) => {
    expect(zoneOutcome(() => resolveEqualLengthPeriodPair({
      timeZone,
      currentFromKey: '2026-07-01',
      currentToKey: '2026-07-07',
    }))).toEqual({ threw: true, message: REQUIRED });
  });

  it('keeps a Nairobi last-full-month pair half-open and adjacent', () => {
    const periods = resolveLastFullCalendarMonthPair({
      timeZone: 'Africa/Nairobi',
      asOf: new Date('2026-08-12T12:00:00.000Z'),
    });
    expect(periods.timeZone).toBe('Africa/Nairobi');
    expect(periods.currentFromKey).toBe('2026-07-01');
    expect(periods.currentToKey).toBe('2026-07-31');
    expect(periods.comparisonFromKey).toBe('2026-06-01');
    expect(periods.comparisonToKey).toBe('2026-06-30');
    expect(periods.currentStart.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(periods.currentEndExclusive.toISOString()).toBe('2026-07-31T21:00:00.000Z');
    expect(periods.comparisonStart.toISOString()).toBe('2026-05-31T21:00:00.000Z');
    expect(periods.comparisonEndExclusive.toISOString()).toBe(periods.currentStart.toISOString());
  });

  it('keeps a Nairobi equal-length pair the same length and half-open', () => {
    const periods = resolveEqualLengthPeriodPair({
      timeZone: 'Africa/Nairobi',
      currentFromKey: '2026-07-01',
      currentToKey: '2026-07-07',
    });
    expect(periods.timeZone).toBe('Africa/Nairobi');
    expect(periods.comparisonFromKey).toBe('2026-06-24');
    expect(periods.comparisonToKey).toBe('2026-06-30');
    expect(periods.currentStart.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(periods.currentEndExclusive.toISOString()).toBe('2026-07-07T21:00:00.000Z');
    expect(periods.comparisonStart.toISOString()).toBe('2026-06-23T21:00:00.000Z');
    expect(periods.comparisonEndExclusive.toISOString()).toBe(periods.currentStart.toISOString());
    expect(periods.currentEndExclusive.getTime() - periods.currentStart.getTime()).toBe(
      periods.comparisonEndExclusive.getTime() - periods.comparisonStart.getTime(),
    );
  });
});

describe('A7 Business Movement calculation fails closed before a substituted timezone is queried', () => {
  async function run(
    timeZone: string | null | undefined,
    calculate: (db: never, timeZone: string | null | undefined) => Promise<unknown>,
  ) {
    const guard = queryGuard();
    let error: unknown;
    try {
      await calculate(guard.db, timeZone);
    } catch (caught) {
      error = caught;
    }
    return {
      message: error instanceof Error ? error.message : null,
      queries: guard.queries,
    };
  }

  it.each(BAD_ZONES)('computeSalesComparisonFromDb does not query when timezone is %s', async (timeZone) => {
    expect(await run(timeZone, (db, zone) => computeSalesComparisonFromDb(db, {
      businessId: 'biz-1',
      currency: 'GHS',
      timeZone: zone,
      asOf: BOUNDARY,
    }))).toEqual({ message: REQUIRED, queries: [] });
  });

  it.each(BAD_ZONES)('computeBusinessMovementWithMoneyFromDb does not query when timezone is %s', async (timeZone) => {
    expect(await run(timeZone, (db, zone) => computeBusinessMovementWithMoneyFromDb(db, {
      businessId: 'biz-1',
      currency: 'GHS',
      timeZone: zone,
      asOf: BOUNDARY,
    }))).toEqual({ message: REQUIRED, queries: [] });
  });
});

describe('A7 businessLocalDayStart does not fall back to Africa/Accra', () => {
  it.each(BAD_ZONES)('rejects %s', (timeZone) => {
    expect(instantOutcome(() => businessLocalDayStart(BOUNDARY, timeZone))).toEqual({
      threw: true,
      message: REQUIRED,
    });
  });

  it('returns Nairobi local midnight for the boundary instant', () => {
    expect(businessLocalDayStart(BOUNDARY, 'Africa/Nairobi').toISOString()).toBe(NAIROBI_DAY_START);
  });
});
