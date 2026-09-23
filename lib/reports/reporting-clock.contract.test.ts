import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addLocalDays,
  businessDayWindow,
  businessLocalDateWindow,
  halfOpenTimestampFilter,
  instantInHalfOpenWindow,
  localDateKey,
  windowForLocalDates,
} from './reporting-clock';

const ACCRA = 'Africa/Accra';

describe('reporting clock half-open Ghana gate', () => {
  const march15 = { year: 2026, month: 3, day: 15 };
  const march16 = { year: 2026, month: 3, day: 16 };

  it('includes the exact start instant and excludes the exact end instant', () => {
    const window = windowForLocalDates(march15, march15, ACCRA);
    expect(instantInHalfOpenWindow(window.startInclusive, window)).toBe(true);
    expect(instantInHalfOpenWindow(window.endExclusive, window)).toBe(false);
    expect(window.startInclusive.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(window.endExclusive.toISOString()).toBe('2026-03-16T00:00:00.000Z');
  });

  it('adjacent windows neither overlap nor leave a gap', () => {
    const first = windowForLocalDates(march15, march15, ACCRA);
    const second = windowForLocalDates(march16, march16, ACCRA);
    expect(first.endExclusive.getTime()).toBe(second.startInclusive.getTime());
    expect(instantInHalfOpenWindow(first.endExclusive, first)).toBe(false);
    expect(instantInHalfOpenWindow(first.endExclusive, second)).toBe(true);
    const span = windowForLocalDates(march15, march16, ACCRA);
    expect(span.startInclusive.getTime()).toBe(first.startInclusive.getTime());
    expect(span.endExclusive.getTime()).toBe(second.endExclusive.getTime());
  });

  it('uses the business timezone when it differs from a US-local reading of the same instant', () => {
    // 2026-01-15 03:30Z is 15 Jan in Accra and still 14 Jan evening in New York.
    const instant = new Date('2026-01-15T03:30:00.000Z');
    const accra = businessDayWindow(instant, ACCRA);
    const newYork = businessDayWindow(instant, 'America/New_York');
    expect(accra.startInclusive.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(accra.endExclusive.toISOString()).toBe('2026-01-16T00:00:00.000Z');
    expect(newYork.startInclusive.toISOString()).not.toBe(accra.startInclusive.toISOString());
    expect(instantInHalfOpenWindow(instant, accra)).toBe(true);
    expect(instantInHalfOpenWindow(instant, newYork)).toBe(true);
    expect(localDateKey(addLocalDays({ year: 2026, month: 1, day: 15 }, 0))).toBe('2026-01-15');
  });

  it('places Ghana business-local midnight on that calendar day', () => {
    const midnight = new Date('2026-06-01T00:00:00.000Z');
    const window = businessDayWindow(midnight, ACCRA);
    expect(window.startInclusive.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(instantInHalfOpenWindow(midnight, window)).toBe(true);
    const previous = businessDayWindow(new Date(midnight.getTime() - 1), ACCRA);
    expect(instantInHalfOpenWindow(midnight, previous)).toBe(false);
    expect(previous.endExclusive.getTime()).toBe(window.startInclusive.getTime());
  });

  it('database bounds are half-open and do not use an inclusive 23:59:59.999 end', () => {
    const window = businessLocalDateWindow('2026-03-01', '2026-03-12', ACCRA);
    expect(window).not.toBeNull();
    const filter = halfOpenTimestampFilter(window!);
    expect(filter.gte.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(filter.lt.toISOString()).toBe('2026-03-13T00:00:00.000Z');
    expect(filter.lt.toISOString()).not.toContain('23:59:59.999');
  });
});

describe('Wave A callers do not mix server-local midnight with Africa/Accra', () => {
  const files = [
    'lib/reports/date-parsing.ts',
    'lib/reports/today-kpis.ts',
    'lib/reports/owner-dashboard.ts',
    'lib/reports/weekly-digest.ts',
    'lib/reports/forecast.ts',
    'lib/reports/financials.ts',
  ];

  it('does not build an inclusive 23:59:59.999 reporting end', () => {
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).not.toContain('23, 59, 59, 999');
      expect(source, file).not.toContain('23:59:59.999');
    }
  });
});
