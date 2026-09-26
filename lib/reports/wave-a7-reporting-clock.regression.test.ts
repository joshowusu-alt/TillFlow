import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  businessDayWindow,
  businessMonthWindow,
  businessWeekWindow,
  localDateInstant,
} from '@/lib/reports/reporting-clock';

/**
 * Nairobi is UTC+3 and Accra is UTC+0.
 * 2026-06-30T22:00:00.000Z is 30 Jun 22:00 in Accra and 1 Jul 01:00 in Nairobi.
 */
const NAIROBI_MONTH_BOUNDARY = new Date('2026-06-30T22:00:00.000Z');
const NAIROBI = 'Africa/Nairobi';

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('A7 reporting clock requires the tenant timezone', () => {
  it('businessDayWindow without a timezone throws', () => {
    expect(() => businessDayWindow(NAIROBI_MONTH_BOUNDARY, undefined as unknown as string)).toThrow(/Business timezone is required/);
  });

  it('businessWeekWindow without a timezone throws', () => {
    expect(() => businessWeekWindow(NAIROBI_MONTH_BOUNDARY, undefined as unknown as string)).toThrow(/Business timezone is required/);
  });

  it('businessMonthWindow without a timezone throws instead of falling back to Accra', () => {
    expect(() => businessMonthWindow(NAIROBI_MONTH_BOUNDARY, undefined as unknown as string)).toThrow(/Business timezone is required/);
  });

  it('localDateInstant without a timezone throws instead of accepting an Accra default', () => {
    expect(() => localDateInstant('2026-07-01', 'start', undefined as unknown as string)).toThrow(/Business timezone is required/);
    expect(() => localDateInstant('2026-07-01', 'endExclusive', '   ')).toThrow(/Business timezone is required/);
  });

  it('an explicit Nairobi month differs from the Accra month at the boundary', () => {
    const nairobi = businessMonthWindow(NAIROBI_MONTH_BOUNDARY, NAIROBI);
    expect(nairobi.startInclusive.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(nairobi.endExclusive.toISOString()).toBe('2026-07-31T21:00:00.000Z');
  });
});

describe('A7 report callers do not replace a missing timezone with Africa/Accra', () => {
  it('Today KPIs use the stored business timezone', () => {
    const source = read('lib/reports/today-kpis.ts');
    expect(source).not.toContain('timezone || DEFAULT_BUSINESS_TIMEZONE');
    expect(source).not.toContain("timezone || 'Africa/Accra'");
    expect(source).toContain('requireReportTimeZone');
  });

  it('Owner Dashboard passes the loaded timezone into daysFromToday', () => {
    const source = read('lib/reports/owner-dashboard.ts');
    expect(source).not.toContain('timezone || DEFAULT_BUSINESS_TIMEZONE');
    expect(source).not.toContain('timeZone = DEFAULT_BUSINESS_TIMEZONE');
    expect(source).toMatch(/function daysFromToday\(date: Date, timeZone: string\)/);
    expect(source).toContain('daysFromToday(invoice.dueDate, timeZone)');
  });

  it('Owner Brief due window uses the loaded business timezone', () => {
    const source = read('lib/owner-intel.ts');
    expect(source).not.toContain('DEFAULT_BUSINESS_TIMEZONE');
    expect(source).not.toContain('setDate(');
    expect(source).toContain('business?.timezone');
  });

  it('Forecast uses the stored business timezone', () => {
    const source = read('lib/reports/forecast.ts');
    expect(source).not.toContain('timezone || DEFAULT_BUSINESS_TIMEZONE');
    expect(source).not.toContain('DEFAULT_BUSINESS_TIMEZONE');
    expect(source).toContain('requireReportTimeZone');
  });

  it('Weekly Digest money-received scope uses the loaded Business.timezone', () => {
    const digest = read('lib/reports/weekly-digest.ts');
    const page = read('app/(protected)/reports/weekly-digest/page.tsx');
    const route = read('app/api/reports/weekly-digest/route.ts');
    expect(digest).not.toContain('DEFAULT_BUSINESS_TIMEZONE');
    expect(digest).toContain('requireReportTimeZone');
    expect(page).toContain('business.timezone');
    expect(page).toContain('getWeeklyDigestData(business.id, week.startInclusive, week.endExclusive, business.timezone)');
    expect(route).toContain('getWeeklyDigestData(business.id, week.startInclusive, week.endExclusive, business.timezone)');
  });

  it('statement from/to filters keep both gte and lt', () => {
    for (const path of [
      'app/(protected)/customers/[id]/statement/route.ts',
      'app/(protected)/suppliers/[id]/statement/route.ts',
    ]) {
      const source = read(path);
      expect(source, path).toContain('gte: start');
      expect(source, path).toContain('lt: endExclusive');
    }
  });
});
