import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addLocalDays,
  defaultTenantLocalRange,
  instantInHalfOpenWindow,
  localDateKey,
  windowForLocalDates,
  zonedDateTimeParts,
} from '@/lib/reports/reporting-clock';

/**
 * A7: the analytics report period must cover exactly `periodDays` tenant-local dates.
 *
 * `loadAnalyticsReport` currently subtracts `periodDays * 86_400_000` from the start of
 * the tenant-local "today", which yields today plus `periodDays` preceding dates — one
 * date too many (a 7d preset covers eight local dates). The previous-period window is
 * derived the same way, so it is also one date too long.
 *
 * Expected after the fix:
 *   current  = defaultTenantLocalRange(now, tz, periodDays)
 *   previous = the same number of tenant-local dates immediately before, so that
 *              previous.endExclusive === current.startInclusive.
 */
const { salesInvoiceFindManyMock } = vi.hoisted(() => ({
  salesInvoiceFindManyMock: vi.fn(async () => []),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    salesInvoice: { findMany: salesInvoiceFindManyMock },
  },
}));

import { loadAnalyticsReport } from '@/app/(protected)/reports/analytics/AnalyticsContent';

const NAIROBI = 'Africa/Nairobi';
const ACCRA = 'Africa/Accra';
const ZONES = [NAIROBI, ACCRA] as const;
const PERIODS = [7, 14, 30] as const;
const INSTANTS = [
  '2026-03-10T20:30:00.000Z',
  '2026-03-10T23:30:00.000Z',
  '2026-03-01T02:00:00.000Z',
  '2026-01-01T03:00:00.000Z',
] as const;
const REQUIRED = 'Business timezone is required for report windows';

type CreatedAtFilter = Record<string, Date>;
type Captured = {
  current: CreatedAtFilter;
  previous: CreatedAtFilter;
};

function iso(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

async function runReport(input: {
  periodDays: number;
  timeZone: string;
  now: Date;
  periodStart?: Date;
  periodEndExclusive?: Date;
}): Promise<Captured> {
  salesInvoiceFindManyMock.mockClear();
  await loadAnalyticsReport({
    businessId: 'biz-1',
    currency: 'GHS',
    periodDays: input.periodDays,
    timeZone: input.timeZone,
    now: input.now,
    periodStart: input.periodStart,
    periodEndExclusive: input.periodEndExclusive,
  });
  expect(salesInvoiceFindManyMock).toHaveBeenCalledTimes(2);
  const calls = salesInvoiceFindManyMock.mock.calls as unknown as Array<[{ where: { createdAt: CreatedAtFilter } }]>;
  return {
    current: calls[0][0].where.createdAt,
    previous: calls[1][0].where.createdAt,
  };
}

/** Tenant-local date keys whose local day starts inside [gte, lt). */
function coveredLocalDateKeys(filter: CreatedAtFilter, timeZone: string): string[] {
  const gte = filter.gte;
  const lt = filter.lt;
  if (!(gte instanceof Date) || !(lt instanceof Date)) return [];
  const keys: string[] = [];
  let cursor: { year: number; month: number; day: number } = zonedDateTimeParts(gte, timeZone);
  while (windowForLocalDates(cursor, cursor, timeZone).startInclusive.getTime() < lt.getTime()) {
    keys.push(localDateKey(cursor));
    cursor = addLocalDays(cursor, 1);
    if (keys.length > 400) break;
  }
  return keys;
}

function expectedPrevious(current: { startInclusive: Date }, periodDays: number, timeZone: string) {
  const startParts = zonedDateTimeParts(current.startInclusive, timeZone);
  return windowForLocalDates(
    addLocalDays(startParts, -periodDays),
    addLocalDays(startParts, -1),
    timeZone,
  );
}

describe('A7 analytics report period covers exactly periodDays tenant-local dates', () => {
  beforeEach(() => {
    salesInvoiceFindManyMock.mockClear();
  });

  it('uses defaultTenantLocalRange for the current period and the adjacent same-length previous period', async () => {
    const mismatches: string[] = [];

    for (const zone of ZONES) {
      for (const periodDays of PERIODS) {
        for (const instant of INSTANTS) {
          const now = new Date(instant);
          const label = `${zone} ${periodDays}d @ ${instant}`;
          const { current, previous } = await runReport({ periodDays, timeZone: zone, now });

          const currentKeys = Object.keys(current).sort();
          if (currentKeys.join(',') !== 'gte,lt') {
            mismatches.push(`${label}: current filter keys ${JSON.stringify(currentKeys)} expected ["gte","lt"]`);
          }
          const previousKeys = Object.keys(previous).sort();
          if (previousKeys.join(',') !== 'gte,lt') {
            mismatches.push(`${label}: previous filter keys ${JSON.stringify(previousKeys)} expected ["gte","lt"]`);
          }

          const expected = defaultTenantLocalRange(now, zone, periodDays);
          if (iso(current.gte) !== expected.startInclusive.toISOString() || iso(current.lt) !== expected.endExclusive.toISOString()) {
            mismatches.push(
              `${label}: current got [${iso(current.gte)}, ${iso(current.lt)}) expected [${expected.startInclusive.toISOString()}, ${expected.endExclusive.toISOString()})`,
            );
          }

          const currentDates = coveredLocalDateKeys(current, zone);
          if (currentDates.length !== periodDays) {
            mismatches.push(`${label}: current covers ${currentDates.length} local dates, expected ${periodDays}`);
          }

          const previousDates = coveredLocalDateKeys(previous, zone);
          if (previousDates.length !== currentDates.length) {
            mismatches.push(
              `${label}: previous covers ${previousDates.length} local dates, current covers ${currentDates.length}`,
            );
          }

          if (iso(previous.lt) !== iso(current.gte)) {
            mismatches.push(`${label}: previous.lt ${iso(previous.lt)} must equal current.gte ${iso(current.gte)}`);
          }
          if (!(previous.gte instanceof Date) || !(previous.lt instanceof Date) || previous.gte.getTime() >= previous.lt.getTime()) {
            mismatches.push(`${label}: previous window [${iso(previous.gte)}, ${iso(previous.lt)}) is not a non-empty half-open range`);
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('Nairobi 7d at 2026-03-10T23:30Z covers exactly 2026-03-05..2026-03-11 and the seven dates before', async () => {
    const now = new Date('2026-03-10T23:30:00.000Z');
    const { current, previous } = await runReport({ periodDays: 7, timeZone: NAIROBI, now });

    expect(iso(current.gte)).toBe('2026-03-04T21:00:00.000Z');
    expect(iso(current.lt)).toBe('2026-03-11T21:00:00.000Z');
    expect(coveredLocalDateKeys(current, NAIROBI)).toEqual([
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
    ]);

    expect(iso(previous.gte)).toBe('2026-02-25T21:00:00.000Z');
    expect(iso(previous.lt)).toBe('2026-03-04T21:00:00.000Z');
  });

  it('excludes a sale created exactly at the current end instant', async () => {
    const now = new Date('2026-03-10T23:30:00.000Z');
    const { current } = await runReport({ periodDays: 7, timeZone: NAIROBI, now });

    expect(current.gte).toBeInstanceOf(Date);
    expect(current.lt).toBeInstanceOf(Date);
    expect(current).not.toHaveProperty('lte');

    const window = { startInclusive: current.gte, endExclusive: current.lt, timeZone: NAIROBI };
    expect(instantInHalfOpenWindow(current.lt, window)).toBe(false);
    expect(instantInHalfOpenWindow(new Date(current.lt.getTime() - 1), window)).toBe(true);
    expect(instantInHalfOpenWindow(current.gte, window)).toBe(true);

    // Emulate Prisma's `{ gte, lt }` comparison for a sale stamped exactly at the end.
    const saleCreatedAt = new Date(current.lt.getTime());
    const matchesFilter = saleCreatedAt.getTime() >= current.gte.getTime() && saleCreatedAt.getTime() < current.lt.getTime();
    expect(matchesFilter).toBe(false);
  });

  it('honours an explicit periodStart/periodEndExclusive and derives the previous period from them', async () => {
    const periodStart = new Date('2026-03-01T00:00:00.000Z');
    const periodEndExclusive = new Date('2026-03-08T00:00:00.000Z');
    const { current, previous } = await runReport({
      periodDays: 7,
      timeZone: ACCRA,
      now: new Date('2026-03-10T20:30:00.000Z'),
      periodStart,
      periodEndExclusive,
    });

    expect(iso(current.gte)).toBe(periodStart.toISOString());
    expect(iso(current.lt)).toBe(periodEndExclusive.toISOString());
    expect(coveredLocalDateKeys(current, ACCRA)).toHaveLength(7);

    const expected = expectedPrevious({ startInclusive: periodStart }, 7, ACCRA);
    expect(iso(previous.gte)).toBe('2026-02-22T00:00:00.000Z');
    expect(iso(previous.lt)).toBe('2026-03-01T00:00:00.000Z');
    expect(iso(previous.gte)).toBe(expected.startInclusive.toISOString());
    expect(iso(previous.lt)).toBe(expected.endExclusive.toISOString());
  });

  it.each([undefined, null, '', '   ', 'Mars/Olympus'])(
    'fails closed for timezone %j before querying sales',
    async (timeZone) => {
      await expect(
        loadAnalyticsReport({
          businessId: 'biz-1',
          currency: 'GHS',
          periodDays: 7,
          timeZone,
          now: new Date('2026-03-10T23:30:00.000Z'),
        }),
      ).rejects.toThrow(REQUIRED);
      expect(salesInvoiceFindManyMock).not.toHaveBeenCalled();
    },
  );
});
