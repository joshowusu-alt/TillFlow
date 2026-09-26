import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
import {
  appRouteScanReport,
  appRoutesMissingTenantZone,
  isAppRouteLabel,
  normaliseScanLabel,
  routeLoadsTenantZone,
  scanLabel,
} from '@/lib/test/reporting-clock-invariant-rules';

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
      const label = scanLabel(process.cwd(), file);
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
      const label = scanLabel(process.cwd(), file);
      if (/setHours\s*\(\s*24\b/.test(source) || /getTime\(\)\s*\+\s*1(?!\d)/.test(source)) {
        escaped.push(label);
      }
    }
    expect(escaped).toEqual([]);
  });

  it('report routes that build a tenant window load Business.timezone', () => {
    const missing = appRoutesMissingTenantZone(productionSources(), process.cwd(), (f) => readFileSync(f, 'utf8'));
    expect(missing).toEqual([]);
  });
});

const FLAGGED_EXPORT_ROUTES = [
  'app/(protected)/exports/margins/route.ts',
  'app/(protected)/exports/momo-confirmation/route.ts',
  'app/(protected)/exports/purchases/route.ts',
  'app/(protected)/exports/reversals/route.ts',
  'app/(protected)/exports/sales/route.ts',
];

function toWindowsLabel(label: string): string {
  return label.replace(/\//g, '\\');
}

function exportRouteFixture(zoneArgument: string, prelude = ''): string {
  return [
    "import { resolveExportDateRange } from '@/app/(protected)/exports/_shared';",
    'export async function GET(request: Request) {',
    '  const business = await prisma.business.findUnique({ where: { id }, select: { timezone: true } });',
    '  const exportBusiness = business;',
    prelude,
    `  const dateRange = resolveExportDateRange(request, '30d', ${zoneArgument});`,
    '  return Response.json(dateRange);',
    '}',
    '',
  ].join('\n');
}

describe('reporting-clock invariant scans identically on Windows and POSIX', () => {
  const windowsMargins = 'app\\(protected)\\exports\\margins\\route.ts';
  const posixMargins = 'app/(protected)/exports/margins/route.ts';

  it('normalises Windows and POSIX scan labels to the same app-route label', () => {
    const problems: string[] = [];
    const normalisedWindows = normaliseScanLabel(windowsMargins);
    if (normalisedWindows !== posixMargins) {
      problems.push(`normaliseScanLabel(windows) -> ${JSON.stringify(normalisedWindows)}`);
    }
    const normalisedPosix = normaliseScanLabel(posixMargins);
    if (normalisedPosix !== posixMargins) {
      problems.push(`normaliseScanLabel(posix) -> ${JSON.stringify(normalisedPosix)}`);
    }
    if (!isAppRouteLabel(posixMargins)) problems.push('isAppRouteLabel rejects the POSIX label');
    if (!isAppRouteLabel(windowsMargins)) problems.push('isAppRouteLabel rejects the Windows label');

    const realLabel = scanLabel(process.cwd(), resolve(process.cwd(), posixMargins));
    if (realLabel.includes('\\')) problems.push(`scanLabel contains a backslash: ${JSON.stringify(realLabel)}`);
    if (!realLabel.startsWith('app/')) problems.push(`scanLabel does not start with app/: ${JSON.stringify(realLabel)}`);
    expect(problems).toEqual([]);
  });

  it('examines the same set of app routes whichever separator the platform produces', () => {
    const posixLabels = productionSources()
      .map((file) => scanLabel(process.cwd(), file))
      .map(normaliseScanLabel)
      .map((label) => label.replace(/\\/g, '/'))
      .filter((label) => label.startsWith('app/'));
    expect(posixLabels.length).toBeGreaterThan(0);

    const scannedFromPosix = new Set(
      posixLabels.map(normaliseScanLabel).filter(isAppRouteLabel),
    );
    const scannedFromWindows = new Set(
      posixLabels.map(toWindowsLabel).map(normaliseScanLabel).filter(isAppRouteLabel),
    );

    const problems: string[] = [];
    for (const label of scannedFromPosix) {
      if (!scannedFromWindows.has(label)) problems.push(`only scanned on POSIX: ${label}`);
    }
    for (const label of scannedFromWindows) {
      if (!scannedFromPosix.has(label)) problems.push(`only scanned on Windows: ${label}`);
    }
    for (const label of [...FLAGGED_EXPORT_ROUTES, 'app/(protected)/exports/eod-csv/route.ts']) {
      if (!scannedFromPosix.has(label)) problems.push(`missing from POSIX scan: ${label}`);
      if (!scannedFromWindows.has(label)) problems.push(`missing from Windows scan: ${label}`);
    }
    expect(problems).toEqual([]);
  });

  it('accepts routes that pass a stored tenant timezone to a window constructor', () => {
    const rejected: string[] = [];
    for (const route of FLAGGED_EXPORT_ROUTES) {
      const source = readFileSync(resolve(process.cwd(), route), 'utf8');
      if (!routeLoadsTenantZone(source)) rejected.push(`on-disk ${route}`);
    }

    const fixtures: Array<{ name: string; source: string }> = [
      { name: 'business.timezone', source: exportRouteFixture('business.timezone') },
      { name: 'business?.timezone', source: exportRouteFixture('business?.timezone') },
      { name: 'exportBusiness.timezone', source: exportRouteFixture('exportBusiness.timezone') },
      { name: 'exportBusiness?.timezone', source: exportRouteFixture('exportBusiness?.timezone') },
      {
        name: 'requireReportTimeZone(business?.timezone)',
        source: exportRouteFixture('requireReportTimeZone(business?.timezone)'),
      },
      {
        name: 'const timeZone = requireReportTimeZone(...)',
        source: exportRouteFixture('timeZone', '  const timeZone = requireReportTimeZone(business?.timezone);'),
      },
      {
        name: 'fallback = defaultTenantLocalRange(...); fallback.timeZone',
        source: [
          "import { resolveReportDateRange } from '@/lib/reports/date-parsing';",
          "import { defaultTenantLocalRange } from '@/lib/reports/reporting-clock';",
          'export async function GET(request: Request) {',
          '  const now = new Date();',
          '  const business = await prisma.business.findUnique({ where: { id }, select: { timezone: true } });',
          '  const fallback = defaultTenantLocalRange(now, business?.timezone, 7);',
          '  const range = resolveReportDateRange(searchParams, fallback.startInclusive, now, fallback.timeZone);',
          '  return Response.json(range);',
          '}',
          '',
        ].join('\n'),
      },
    ];
    for (const fixture of fixtures) {
      if (!routeLoadsTenantZone(fixture.source)) rejected.push(`fixture ${fixture.name}`);
    }
    expect(rejected).toEqual([]);
  });

  it('rejects routes whose only timezone mention is a comment or a hard-coded literal', () => {
    const fixtures: Array<{ name: string; source: string }> = [
      {
        name: 'comment mentions Business.timezone but constructor has no zone argument',
        source: [
          "import { resolveExportDateRange } from '@/app/(protected)/exports/_shared';",
          'export async function GET(request: Request) {',
          '  // timezone is stored on Business but never loaded here',
          "  const dateRange = resolveExportDateRange(request, '30d');",
          '  return Response.json(dateRange);',
          '}',
          '',
        ].join('\n'),
      },
      {
        name: 'hard-coded timeZone literal passed to the constructor',
        source: [
          "import { resolveExportDateRange } from '@/app/(protected)/exports/_shared';",
          'export async function GET(request: Request) {',
          "  const timeZone = 'Africa/Accra';",
          "  const dateRange = resolveExportDateRange(request, '30d', timeZone);",
          '  return Response.json(dateRange);',
          '}',
          '',
        ].join('\n'),
      },
      {
        name: 'timeZone appears only in a comment and constructor has no zone argument',
        source: [
          "import { resolveExportDateRange } from '@/app/(protected)/exports/_shared';",
          'export async function GET(request: Request) {',
          '  // TODO: thread the tenant timeZone through once the schema exposes it',
          "  const dateRange = resolveExportDateRange(request, '30d');",
          '  return Response.json(dateRange);',
          '}',
          '',
        ].join('\n'),
      },
    ];
    const wronglyAccepted: string[] = [];
    for (const fixture of fixtures) {
      if (routeLoadsTenantZone(fixture.source)) wronglyAccepted.push(fixture.name);
    }
    expect(wronglyAccepted).toEqual([]);
  });

  it('actually examines the constructor-bearing app routes on this platform', () => {
    const report = appRouteScanReport(productionSources(), process.cwd(), (f) => readFileSync(f, 'utf8'));
    const examined = new Set(report.examined.map(normaliseScanLabel));
    const problems: string[] = [];
    if (examined.size < 6) {
      problems.push(`examined only ${examined.size} app route(s): ${JSON.stringify([...examined])}`);
    }
    for (const route of FLAGGED_EXPORT_ROUTES) {
      if (!examined.has(route)) problems.push(`not examined: ${route}`);
    }
    expect(problems).toEqual([]);
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
    let cursor: { year: number; month: number; day: number } = start;
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
      const label = scanLabel(process.cwd(), file);
      expect(source, label).not.toMatch(importPattern);
      expect(source, label).not.toMatch(callPattern);
    }
  });
});
