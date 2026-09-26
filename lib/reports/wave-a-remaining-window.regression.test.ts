import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  businessDayWindow,
  businessWeekWindow,
  halfOpenTimestampFilter,
  instantInHalfOpenWindow,
} from './reporting-clock';

/**
 * Justified `lte` exclusions — not reporting-period ends:
 * - non-date comparisons (qty, cost, thresholds)
 * - genuine point-in-time “as of” instants (`asOf` / `now`), which include that instant
 * - scheduler due times (`nextAttemptAt`)
 */
export const JUSTIFIED_LTE_EXCLUSIONS: Array<{ file: string; reason: string }> = [
  { file: 'lib/reports/forecast.ts', reason: 'entryDate lte now is cash on hand as of now' },
  { file: 'lib/reports/money-received/query.ts', reason: 'receivedAt lte asOf is confirmed receipts through an instant' },
  { file: 'lib/owner-intel.ts', reason: 'dueDate lte sevenDays is an as-of attention cutoff, not a report period' },
  { file: 'lib/notifications/owner-daily-summary-sms.ts', reason: 'qtyOnHandBase lte 0 is not a date window' },
  { file: 'lib/reports/incomplete-stock.ts', reason: 'lineCostPence lte 0 is not a date window' },
  { file: 'lib/services/products.ts', reason: 'avgCostBasePence lte 0 is not a date window' },
  { file: 'app/actions/notifications.ts', reason: 'qtyOnHandBase lte 0 is not a date window' },
  { file: 'app/api/cron/dispatch-storefront-notifications/route.ts', reason: 'nextAttemptAt lte now is a scheduler due check' },
];

const INCLUSIVE_END = /setHours\(\s*23\s*,\s*59\s*,\s*59\s*,\s*999\s*\)/;
const SERVER_LOCAL_MONTH = /new Date\(\s*now\.getFullYear\(\)\s*,\s*now\.getMonth\(\)\s*,\s*1\s*\)/;

const REPORTING_WINDOW_FILES = [
  'app/(protected)/customers/[id]/statement/route.ts',
  'app/(protected)/suppliers/[id]/statement/route.ts',
  'app/(protected)/customers/[id]/page.tsx',
  'app/(protected)/suppliers/[id]/page.tsx',
  'app/actions/reconciliation.ts',
  'app/(protected)/payments/reconciliation/page.tsx',
  'app/(protected)/payments/reconciliation/card-transfer/page.tsx',
  'app/(protected)/shifts/drawer/page.tsx',
  'app/api/reports/financials/route.ts',
  'app/api/exports/pack/route.ts',
  'lib/exports/csv-writers.ts',
  'lib/services/cash-drawer.ts',
  'lib/services/customers.ts',
  'lib/reports/supplier-sales.ts',
  'app/(protected)/reports/analytics/AnalyticsContent.tsx',
  'app/actions/onboarding.ts',
];

function walkSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'tmp' || entry === 'prisma') continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkSources(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

const ACCRA = 'Africa/Accra';

describe('A7 remaining reporting windows are half-open', () => {
  it('includes the Ghana local day start and excludes the next local midnight', () => {
    const day = businessDayWindow(new Date('2026-03-15T15:00:00.000Z'), ACCRA);
    expect(day.timeZone).toBe(ACCRA);
    expect(day.startInclusive.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(day.endExclusive.toISOString()).toBe('2026-03-16T00:00:00.000Z');
    expect(instantInHalfOpenWindow(day.startInclusive, day)).toBe(true);
    expect(instantInHalfOpenWindow(day.endExclusive, day)).toBe(false);
    expect(day.endExclusive.toISOString()).not.toContain('23:59:59.999');
  });

  it('builds a Ghana Monday week with no overlap and no gap against the next week', () => {
    const week = businessWeekWindow(new Date('2026-03-15T12:00:00.000Z'), ACCRA);
    const next = businessWeekWindow(new Date('2026-03-15T12:00:00.000Z'), ACCRA, 1);
    expect(week.startInclusive.toISOString()).toBe('2026-03-09T00:00:00.000Z');
    expect(week.endExclusive.toISOString()).toBe('2026-03-16T00:00:00.000Z');
    expect(next.startInclusive.getTime()).toBe(week.endExclusive.getTime());
    expect(instantInHalfOpenWindow(week.endExclusive, week)).toBe(false);
    expect(instantInHalfOpenWindow(week.endExclusive, next)).toBe(true);
  });

  it('builds the Ghana calendar month as [local 1st, next local 1st)', async () => {
    const clock = await import('./reporting-clock');
    expect(typeof clock.businessMonthWindow).toBe('function');
    const march = clock.businessMonthWindow!(new Date('2026-03-15T12:00:00.000Z'), ACCRA);
    const april = clock.businessMonthWindow!(new Date('2026-04-01T00:00:00.000Z'), ACCRA);
    expect(march.startInclusive.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(march.endExclusive.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(april.startInclusive.getTime()).toBe(march.endExclusive.getTime());
    expect(instantInHalfOpenWindow(march.endExclusive, march)).toBe(false);
    expect(instantInHalfOpenWindow(new Date('2026-03-31T23:59:59.999Z'), march)).toBe(true);
    const filter = halfOpenTimestampFilter(march);
    expect(filter).toEqual({ gte: march.startInclusive, lt: march.endExclusive });
    expect(JSON.stringify(filter)).not.toContain('23:59:59.999');
  });

  it('keeps a New York calendar month on local midnights, not UTC or 23:59:59.999', async () => {
    const clock = await import('./reporting-clock');
    expect(typeof clock.businessMonthWindow).toBe('function');
    const window = clock.businessMonthWindow!(new Date('2026-01-15T03:30:00.000Z'), 'America/New_York');
    expect(window.timeZone).toBe('America/New_York');
    expect(window.startInclusive.toISOString()).toBe('2026-01-01T05:00:00.000Z');
    expect(window.endExclusive.toISOString()).toBe('2026-02-01T05:00:00.000Z');
    expect(instantInHalfOpenWindow(window.startInclusive, window)).toBe(true);
    expect(instantInHalfOpenWindow(window.endExclusive, window)).toBe(false);
  });

  it('does not construct a server-local inclusive end in any reporting source', () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const file of walkSources(root)) {
      const source = readFileSync(file, 'utf8');
      if (INCLUSIVE_END.test(source) || source.includes('23:59:59.999')) {
        offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('queries statement, reconciliation, export, and linked-supplier windows with an exclusive end', () => {
    for (const file of REPORTING_WINDOW_FILES) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source, file).not.toMatch(INCLUSIVE_END);
      expect(source, file).not.toMatch(/lte:\s*(to|end|dayEnd|toEnd|mtdEnd|yesterdayEnd|range\.to|input\.to|opts\.to)\b/);
      expect(source, file).not.toMatch(SERVER_LOCAL_MONTH);
    }
    const supplierSales = readFileSync(path.join(process.cwd(), 'lib/reports/supplier-sales.ts'), 'utf8');
    expect(supplierSales).toContain('businessMonthWindow');
    expect(supplierSales).toMatch(/createdAt:\s*\{[^}]*lt:\s*endExclusive/);
  });
});
