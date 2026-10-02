import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const SHELL_PAGES = [
  'app/(protected)/reports/dashboard/page.tsx',
  'app/(protected)/reports/analytics/page.tsx',
  'app/(protected)/reports/business-movement/page.tsx',
  'app/(protected)/reports/money-received/page.tsx',
  'app/(protected)/reports/momo-confirmation/page.tsx',
  'app/(protected)/reports/cash-drawer/page.tsx',
  'app/(protected)/reports/stock-movements/page.tsx',
  'app/(protected)/reports/margins/page.tsx',
  'app/(protected)/reports/reorder-suggestions/page.tsx',
  'app/(protected)/reports/sales-by-supplier/page.tsx',
  'app/(protected)/reports/risk-monitor/page.tsx',
  'app/(protected)/reports/income-statement/page.tsx',
  'app/(protected)/reports/exports/page.tsx',
  'app/(protected)/reports/owner/page.tsx',
  'app/(protected)/reports/audit-log/page.tsx',
];

describe('Stage 3A.1 customer presentation', () => {
  it('uses one 1440 canvas and removes the extra Today inset', () => {
    const canvas = read('components/reports/ReportsCanvas.tsx');
    const layout = read('app/(protected)/reports/layout.tsx');
    const today = read('components/reports/today/TodayScreen.tsx');
    expect(canvas).toContain('max-w-[1440px]');
    expect(canvas).toContain('data-reports-canvas');
    expect(layout).toContain('ReportsCanvas');
    expect(layout).toContain('/reports/command-center');
    expect(today).not.toContain('max-w-6xl');
    expect(today).not.toContain('px-4 py-3 sm:px-6');
    expect(today).toContain('data-reconciliation-grid');
    expect(today).toContain('data-metric-block="sales"');
    expect(today).toContain('data-metric-block="money"');
    expect(today).toContain('data-metric-block="cash"');
    expect(today).toContain('md:grid-cols-3');
    expect(today).toContain('data-directory-grid');
    expect(today).toContain('xl:grid-cols-3');
  });

  it('gives every listed destination the shared head and one return landmark', () => {
    const nav = read('components/reports/ReportsContextNav.tsx');
    expect(nav).toContain('aria-label="Reports location"');
    expect(nav).toContain('data-return-path');
    expect(nav).toContain('aria-label={`${path.backLabel}, Reports`}');
    expect(nav).toContain('← {sectionLabel}');
    expect(nav).toContain('Back to Today');
    for (const file of SHELL_PAGES) {
      const source = read(file);
      expect(source, file).toContain('ReportsDestinationHead');
      expect(source, file).not.toContain('PageHeader');
      expect(source, file).not.toContain('aria-label="Reports location"');
    }
  });

  it('keeps Sales Analytics amounts on one line and lets status text wrap', () => {
    const client = read('app/(protected)/reports/analytics/AnalyticsClient.tsx');
    expect(client).toContain('FinancialAmount');
    expect(client).toContain('data-analytics-amount="revenue"');
    expect(client).toContain('Costs incomplete');
    expect(client).not.toMatch(/font-bold text-emerald-600 truncate/);
    expect(client).not.toContain('truncate font-bold');
  });

  it('leaves Home source off the Reports canvas', () => {
    for (const file of ['components/ReadinessJourney.tsx', 'components/owner-home/HomePerformanceSlot.tsx']) {
      const home = read(file);
      expect(home, file).not.toContain('ReportsCanvas');
      expect(home, file).not.toContain('ReportsDestinationHead');
      expect(home, file).not.toContain('data-reconciliation-grid');
    }
  });
});
