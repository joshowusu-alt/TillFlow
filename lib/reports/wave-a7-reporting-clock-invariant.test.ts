import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveExportDateRange } from '@/app/(protected)/exports/_shared';
import {
  businessLocalParts,
  formatPeriodChromeKey,
  resolveEqualLengthPeriodPair,
  resolveLastFullCalendarMonthPair,
} from '@/lib/reports/business-movement/periods';
import { resolveReportDateRange, resolveSelectableReportDateRange } from '@/lib/reports/date-parsing';
import { businessLocalDayStart, resolveMoneyReceivedScope } from '@/lib/reports/money-received/scope-clock';
import {
  addLocalDays,
  businessDayWindow,
  businessLocalDateWindow,
  businessMonthWindow,
  businessWeekWindow,
  defaultTenantLocalRange,
  instantInHalfOpenWindow,
  localDateInstant,
  localDateKey,
  windowForLocalDates,
  zonedDateTimeParts,
  type HalfOpenWindow,
} from '@/lib/reports/reporting-clock';
import { resolveReportingScope } from '@/lib/reports/reporting-scope';

/**
 * 2026-06-30T22:00:00.000Z is 30 Jun 22:00 in Accra and 1 Jul 01:00 in Nairobi.
 */
const BOUNDARY = new Date('2026-06-30T22:00:00.000Z');
const ACCRA = 'Africa/Accra';
const NAIROBI = 'Africa/Nairobi';
const REQUIRED = 'Business timezone is required for report windows';
const BAD_ZONES = [undefined, null, '', '   ', 'Mars/Olympus'] as const;
const JULY_FIRST = { year: 2026, month: 7, day: 1 };

function expectClosed(call: (timeZone?: string | null) => unknown) {
  for (const timeZone of BAD_ZONES) {
    let message: string | null = null;
    try {
      call(timeZone);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message, String(timeZone)).toBe(REQUIRED);
  }
}

function assertMeets(current: HalfOpenWindow, next: HalfOpenWindow) {
  expect(instantInHalfOpenWindow(current.startInclusive, current)).toBe(true);
  expect(instantInHalfOpenWindow(current.endExclusive, current)).toBe(false);
  expect(next.startInclusive.getTime()).toBe(current.endExclusive.getTime());
  expect(instantInHalfOpenWindow(current.endExclusive, next)).toBe(true);
}

function productionReportSources(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...productionReportSources(full));
    } else if (/\.(ts|tsx)$/.test(name) && !name.includes('.test.')) {
      files.push(full);
    }
  }
  return files;
}

describe('report time constructors require an explicit tenant timezone', () => {
  const probes: Array<{ name: string; call: (timeZone?: string | null) => unknown }> = [
    { name: 'businessDayWindow', call: (timeZone) => businessDayWindow(BOUNDARY, timeZone as string) },
    { name: 'businessWeekWindow', call: (timeZone) => businessWeekWindow(BOUNDARY, timeZone as string) },
    { name: 'businessMonthWindow', call: (timeZone) => businessMonthWindow(BOUNDARY, timeZone as string) },
    { name: 'localDateInstant', call: (timeZone) => localDateInstant('2026-07-01', 'start', timeZone as string) },
    { name: 'zonedDateTimeParts', call: (timeZone) => zonedDateTimeParts(BOUNDARY, timeZone) },
    { name: 'businessLocalDateWindow', call: (timeZone) => businessLocalDateWindow('2026-07-01', '2026-07-01', timeZone) },
    { name: 'windowForLocalDates', call: (timeZone) => windowForLocalDates(JULY_FIRST, JULY_FIRST, timeZone) },
    { name: 'defaultTenantLocalRange', call: (timeZone) => defaultTenantLocalRange(BOUNDARY, timeZone, 7) },
    {
      name: 'resolveReportDateRange',
      call: (timeZone) => resolveReportDateRange(
        { from: '2026-07-01', to: '2026-07-01' },
        BOUNDARY,
        BOUNDARY,
        timeZone,
      ),
    },
    {
      name: 'resolveSelectableReportDateRange',
      call: (timeZone) => resolveSelectableReportDateRange(
        { period: 'custom', from: '2026-07-01', to: '2026-07-01' },
        '30d',
        BOUNDARY,
        timeZone,
      ),
    },
    {
      name: 'resolveExportDateRange',
      call: (timeZone) => resolveExportDateRange(
        new Request('http://localhost/exports/sales?period=custom&from=2026-07-01&to=2026-07-01'),
        '30d',
        timeZone,
      ),
    },
    {
      name: 'resolveReportingScope',
      call: (timeZone) => resolveReportingScope({
        businessId: 'biz-1',
        timeZone,
        params: { period: 'today', storeId: 'ALL' },
        defaultPeriod: 'today',
        allowedStoreIds: [],
        now: BOUNDARY,
      }),
    },
    {
      name: 'resolveLastFullCalendarMonthPair',
      call: (timeZone) => resolveLastFullCalendarMonthPair({ timeZone, asOf: new Date('2026-08-12T12:00:00.000Z') }),
    },
    {
      name: 'resolveEqualLengthPeriodPair',
      call: (timeZone) => resolveEqualLengthPeriodPair({
        timeZone,
        currentFromKey: '2026-07-01',
        currentToKey: '2026-07-07',
      }),
    },
    { name: 'businessLocalDayStart', call: (timeZone) => businessLocalDayStart(BOUNDARY, timeZone) },
    {
      name: 'resolveMoneyReceivedScope',
      call: (timeZone) => resolveMoneyReceivedScope({
        businessId: 'biz-1',
        currency: 'GHS',
        timeZone,
        periodStart: BOUNDARY,
        periodEndInclusive: BOUNDARY,
      }),
    },
    { name: 'businessLocalParts', call: (timeZone) => businessLocalParts(BOUNDARY, timeZone) },
    { name: 'formatPeriodChromeKey', call: (timeZone) => formatPeriodChromeKey(BOUNDARY, timeZone) },
  ];

  it.each(probes)('$name rejects missing, blank, and invalid timezones', ({ call }) => {
    expectClosed(call);
  });

  it('keeps Ghana and Nairobi day, week, and month windows half-open and adjacent', () => {
    for (const zone of [ACCRA, NAIROBI]) {
      const day = businessDayWindow(BOUNDARY, zone);
      expect(day.timeZone).toBe(zone);
      assertMeets(day, businessDayWindow(day.endExclusive, zone));

      const week = businessWeekWindow(BOUNDARY, zone);
      expect(week.timeZone).toBe(zone);
      assertMeets(week, businessWeekWindow(BOUNDARY, zone, 1));

      const month = businessMonthWindow(BOUNDARY, zone);
      expect(month.timeZone).toBe(zone);
      assertMeets(month, businessMonthWindow(month.endExclusive, zone));
    }

    expect(businessDayWindow(BOUNDARY, ACCRA).startInclusive.toISOString()).toBe('2026-06-30T00:00:00.000Z');
    expect(businessDayWindow(BOUNDARY, ACCRA).endExclusive.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(businessDayWindow(BOUNDARY, NAIROBI).startInclusive.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(businessDayWindow(BOUNDARY, NAIROBI).endExclusive.toISOString()).toBe('2026-07-01T21:00:00.000Z');

    expect(businessWeekWindow(BOUNDARY, ACCRA).startInclusive.toISOString()).toBe('2026-06-29T00:00:00.000Z');
    expect(businessWeekWindow(BOUNDARY, ACCRA).endExclusive.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(businessWeekWindow(BOUNDARY, NAIROBI).startInclusive.toISOString()).toBe('2026-06-28T21:00:00.000Z');
    expect(businessWeekWindow(BOUNDARY, NAIROBI).endExclusive.toISOString()).toBe('2026-07-05T21:00:00.000Z');

    expect(businessMonthWindow(BOUNDARY, ACCRA).startInclusive.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(businessMonthWindow(BOUNDARY, ACCRA).endExclusive.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(businessMonthWindow(BOUNDARY, NAIROBI).startInclusive.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(businessMonthWindow(BOUNDARY, NAIROBI).endExclusive.toISOString()).toBe('2026-07-31T21:00:00.000Z');
  });

  it('preserves Ghana and Nairobi on the remaining report constructors', () => {
    expect(localDateInstant('2026-07-01', 'start', ACCRA)?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(localDateInstant('2026-07-01', 'start', NAIROBI)?.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(localDateInstant('2026-07-01', 'endExclusive', ACCRA)?.toISOString()).toBe('2026-07-02T00:00:00.000Z');
    expect(localDateInstant('2026-07-01', 'endExclusive', NAIROBI)?.toISOString()).toBe('2026-07-01T21:00:00.000Z');

    expect(zonedDateTimeParts(BOUNDARY, ACCRA)).toMatchObject({ year: 2026, month: 6, day: 30, hour: 22 });
    expect(zonedDateTimeParts(BOUNDARY, NAIROBI)).toMatchObject({ year: 2026, month: 7, day: 1, hour: 1 });

    const accraDate = businessLocalDateWindow('2026-07-01', '2026-07-01', ACCRA);
    const nairobiDate = businessLocalDateWindow('2026-07-01', '2026-07-01', NAIROBI);
    expect(accraDate?.timeZone).toBe(ACCRA);
    expect(nairobiDate?.timeZone).toBe(NAIROBI);
    expect(accraDate?.startInclusive.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(nairobiDate?.startInclusive.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(windowForLocalDates(JULY_FIRST, JULY_FIRST, ACCRA).endExclusive.toISOString()).toBe('2026-07-02T00:00:00.000Z');
    expect(windowForLocalDates(JULY_FIRST, JULY_FIRST, NAIROBI).endExclusive.toISOString()).toBe('2026-07-01T21:00:00.000Z');

    const accraReport = resolveReportDateRange({ from: '2026-07-01', to: '2026-07-01' }, BOUNDARY, BOUNDARY, ACCRA);
    const nairobiReport = resolveReportDateRange({ from: '2026-07-01', to: '2026-07-01' }, BOUNDARY, BOUNDARY, NAIROBI);
    expect(accraReport.start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(accraReport.end.toISOString()).toBe('2026-07-02T00:00:00.000Z');
    expect(nairobiReport.start.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(nairobiReport.end.toISOString()).toBe('2026-07-01T21:00:00.000Z');

    const request = new Request('http://localhost/exports/sales?period=custom&from=2026-07-01&to=2026-07-01');
    expect(resolveExportDateRange(request, '30d', ACCRA).start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(resolveExportDateRange(request, '30d', NAIROBI).start.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(resolveSelectableReportDateRange(
      { period: 'custom', from: '2026-07-01', to: '2026-07-01' },
      '30d',
      BOUNDARY,
      NAIROBI,
    ).start.toISOString()).toBe('2026-06-30T21:00:00.000Z');

    const scope = resolveReportingScope({
      businessId: 'biz-1',
      timeZone: NAIROBI,
      params: { period: 'today', storeId: 'ALL' },
      defaultPeriod: 'today',
      allowedStoreIds: [],
      now: BOUNDARY,
    });
    expect(scope.timeZone).toBe(NAIROBI);
    expect(scope.fromInputValue).toBe('2026-07-01');

    const months = resolveLastFullCalendarMonthPair({
      timeZone: NAIROBI,
      asOf: new Date('2026-08-12T12:00:00.000Z'),
    });
    expect(months.timeZone).toBe(NAIROBI);
    expect(months.comparisonEndExclusive.toISOString()).toBe(months.currentStart.toISOString());
    const equal = resolveEqualLengthPeriodPair({
      timeZone: ACCRA,
      currentFromKey: '2026-07-01',
      currentToKey: '2026-07-07',
    });
    expect(equal.timeZone).toBe(ACCRA);
    expect(equal.currentStart.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(equal.comparisonEndExclusive.toISOString()).toBe(equal.currentStart.toISOString());

    expect(businessLocalDayStart(BOUNDARY, ACCRA).toISOString()).toBe('2026-06-30T00:00:00.000Z');
    expect(businessLocalDayStart(BOUNDARY, NAIROBI).toISOString()).toBe('2026-06-30T21:00:00.000Z');

    const money = resolveMoneyReceivedScope({
      businessId: 'biz-1',
      currency: 'GHS',
      timeZone: NAIROBI,
      periodStart: BOUNDARY,
      periodEndInclusive: BOUNDARY,
    });
    expect(money.timeZone).toBe(NAIROBI);
    expect(money.periodStart.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(money.periodEndExclusive.toISOString()).toBe('2026-07-01T21:00:00.000Z');

    expect(businessLocalParts(BOUNDARY, ACCRA)).toEqual({ year: 2026, month: 6, day: 30 });
    expect(businessLocalParts(BOUNDARY, NAIROBI)).toEqual({ year: 2026, month: 7, day: 1 });
    expect(formatPeriodChromeKey(BOUNDARY, ACCRA)).toBe('2026-06-30');
    expect(formatPeriodChromeKey(BOUNDARY, NAIROBI)).toBe('2026-07-01');
  });
});

const REPORT_SOURCE_ROOTS = [
  'lib/reports',
  'lib/owner-home',
  'app/(protected)/reports',
  'app/(protected)/exports',
  'app/(protected)/settings/analytics',
  'app/api/reports',
  'app/api/exports',
];

const REPORT_SOURCE_FILES = [
  'lib/services/risk-monitor.ts',
];

const DEFAULT_WINDOW_CALL_SITES = [
  'app/(protected)/reports/cash-drawer/page.tsx',
  'app/(protected)/reports/risk-monitor/page.tsx',
  'app/(protected)/reports/stock-movements/page.tsx',
  'app/(protected)/reports/money-received/page.tsx',
  'app/(protected)/reports/momo-confirmation/page.tsx',
  'app/(protected)/exports/eod-csv/route.ts',
  'app/(protected)/exports/eod-pdf/route.ts',
  'app/(protected)/exports/risk-summary/route.ts',
  'app/(protected)/settings/analytics/page.tsx',
  'lib/services/risk-monitor.ts',
];

function productionSources(): string[] {
  const fromDirs = REPORT_SOURCE_ROOTS.flatMap((root) => {
    const full = resolve(process.cwd(), root);
    try {
      statSync(full);
    } catch {
      return [];
    }
    return productionReportSources(full);
  });
  const files = REPORT_SOURCE_FILES.flatMap((file) => {
    const full = resolve(process.cwd(), file);
    try {
      statSync(full);
    } catch {
      return [];
    }
    return [full];
  });
  return [...fromDirs, ...files];
}

function lineReason(line: string): string | null {
  if (/toISOString\(\)\.slice\(\s*0\s*,\s*10\s*\)/.test(line)) {
    const display = /filename|fallbackFilename|dateSlug|Content-Disposition|^\s*(date|reversalDate|originalDate|lastSold)\s*:/.test(line.trim())
      || /filename=/.test(line)
      || /const (date|label) = /.test(line.trim());
    if (display && !/\b(gte|lt|lte)\s*:/.test(line) && !/setHours\s*\(/.test(line)) {
      return 'display or filename text, not a query boundary';
    }
  }
  return null;
}

describe('report and export sources keep tenant windows explicit', () => {
  const patterns = [
    { name: 'setHours', re: /setHours\s*\(/ },
    { name: 'serverLocalMidnight', re: /setHours\s*\(\s*0(?:\s*,\s*0){1,3}/ },
    { name: 'setDate', re: /setDate\s*\(/ },
    { name: 'serverLocalMonth', re: /new Date\(\s*\w+\.getFullYear\(\)\s*,\s*\w+\.getMonth\(\)/ },
    { name: 'utcDayKey', re: /toISOString\(\)\.slice\(\s*0\s*,\s*10\s*\)/ },
    { name: 'exclusiveEndPlusOne', re: /getTime\(\)\s*\+\s*1(?!\d)/ },
    { name: 'notificationFallback', re: /\bresolveBusinessTimeZone\s*\(/ },
    { name: 'exclusiveEndLte', re: /\blte\s*:\s*(to|end|endExclusive|dateRange\.end|periodEnd(?:Exclusive)?)\b/ },
  ];

  it('flags server-local window construction unless a focused exception proves it is not a boundary', () => {
    const unexplained: string[] = [];
    for (const file of productionSources()) {
      const source = readFileSync(file, 'utf8');
      const label = relative(process.cwd(), file);
      source.split(/\r?\n/).forEach((line, index) => {
        for (const pattern of patterns) {
          if (!pattern.re.test(line)) continue;
          const reason = lineReason(line);
          if (!reason) unexplained.push(`${label}:${index + 1} ${pattern.name} ${line.trim()}`);
        }
      });
    }
    expect(unexplained).toEqual([]);
  });

  it('does not allow setHours(24) or a one-millisecond exclusive-end bump', () => {
    const escaped: string[] = [];
    for (const file of productionSources()) {
      const source = readFileSync(file, 'utf8');
      const label = relative(process.cwd(), file);
      if (/setHours\s*\(\s*24\b/.test(source) || /getTime\(\)\s*\+\s*1(?!\d)/.test(source)) {
        escaped.push(label);
      }
    }
    expect(escaped).toEqual([]);
  });

  it('report routes that build a tenant window load Business.timezone', () => {
    const constructors = /resolveReportDateRange\(|resolveExportDateRange\(|businessDayWindow\(|businessWeekWindow\(|businessMonthWindow\(|localDateInstant\(|defaultTenantLocalRange\(/;
    const missing: string[] = [];
    for (const file of productionSources()) {
      const label = relative(process.cwd(), file);
      if (!label.startsWith('app/')) continue;
      const source = readFileSync(file, 'utf8');
      if (!constructors.test(source)) continue;
      const loadsZone = /business\.timezone|requireReportTimeZone\(|timeZone/.test(source);
      if (!loadsZone) missing.push(label);
    }
    expect(missing).toEqual([]);
  });
});

describe('default tenant ranges ignore the server timezone', () => {
  const instants = [
    '2026-03-10T20:30:00.000Z',
    '2026-03-10T23:30:00.000Z',
    '2026-03-01T02:00:00.000Z',
    '2026-01-01T03:00:00.000Z',
  ];

  function coveredDays(window: HalfOpenWindow) {
    const start = zonedDateTimeParts(window.startInclusive, window.timeZone);
    const last = zonedDateTimeParts(new Date(window.endExclusive.getTime() - 1), window.timeZone);
    let count = 0;
    let cursor = start;
    while (localDateKey(cursor) <= localDateKey(last)) {
      count += 1;
      cursor = addLocalDays(cursor, 1);
      if (count > 400) break;
    }
    return count;
  }

  it.each(instants.flatMap((instant) => [ACCRA, NAIROBI].map((zone) => [instant, zone] as const)))(
    'keeps %s %s defaults identical to the tenant calendar around the New York spring-forward',
    (instant, zone) => {
      const now = new Date(instant);
      for (const days of [7, 14, 30]) {
        const range = defaultTenantLocalRange(now, zone, days);
        const today = zonedDateTimeParts(now, zone);
        const start = addLocalDays(today, -(days - 1));
        const canonical = windowForLocalDates(start, today, zone);
        const next = windowForLocalDates(addLocalDays(today, 1), addLocalDays(today, 1), zone);
        expect(range.startInclusive.toISOString()).toBe(canonical.startInclusive.toISOString());
        expect(range.endExclusive.toISOString()).toBe(canonical.endExclusive.toISOString());
        expect(range.endExclusive.toISOString()).toBe(next.startInclusive.toISOString());
        expect(instantInHalfOpenWindow(range.startInclusive, range)).toBe(true);
        expect(instantInHalfOpenWindow(range.endExclusive, range)).toBe(false);
        expect(coveredDays(range)).toBe(days);
      }
    },
  );

  it('uses the canonical helper at every former setDate fallback', () => {
    for (const file of DEFAULT_WINDOW_CALL_SITES) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).toContain('defaultTenantLocalRange');
      expect(source, file).not.toContain('setDate(');
      expect(source, file).not.toContain('setHours(');
    }
  });

  it('builds cashflow and income-statement defaults from the tenant month', () => {
    for (const file of [
      'app/(protected)/reports/cashflow/page.tsx',
      'app/(protected)/reports/income-statement/page.tsx',
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).toContain('businessMonthWindow');
      expect(source, file).not.toContain('getFullYear()');
      expect(source, file).not.toContain('getMonth()');
    }
    const instant = new Date('2026-03-01T02:00:00.000Z');
    for (const zone of [ACCRA, NAIROBI]) {
      const month = businessMonthWindow(instant, zone);
      const range = resolveReportDateRange(undefined, month.startInclusive, instant, month.timeZone);
      const today = zonedDateTimeParts(instant, zone);
      const canonical = windowForLocalDates({ year: today.year, month: today.month, day: 1 }, today, zone);
      expect(range.start.toISOString()).toBe(canonical.startInclusive.toISOString());
      expect(range.end.toISOString()).toBe(canonical.endExclusive.toISOString());
    }
  });
});

describe('lib/reports does not import the notification timezone fallback', () => {
  it('production report sources do not import or call resolveBusinessTimeZone', () => {
    const importPattern = /import\s*\{[^}]*\bresolveBusinessTimeZone\b[^}]*\}\s*from\s*['"]@\/lib\/notifications\/utils['"]/;
    const callPattern = /\bresolveBusinessTimeZone\s*\(/;
    const files = productionReportSources(resolve(process.cwd(), 'lib/reports'));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const label = relative(process.cwd(), file);
      expect(source, label).not.toMatch(importPattern);
      expect(source, label).not.toMatch(callPattern);
    }
  });
});
