import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NAV_GROUPS, REPORT_NAV_SECTIONS } from '@/lib/navigation-config';

const root = process.cwd();
const readSource = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Reports dashboard clarity pass', () => {
  it('labels dashboard and weekly payment sections as payment receipts', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/page.tsx');
    const weeklyPage = readSource('app/(protected)/reports/weekly-digest/page.tsx');

    expect(dashboard).toContain('Payment Receipts Split');
    expect(weeklyPage).toContain('Payment Receipts Split');
    expect(dashboard).toContain('Receipts may differ from sales when customers pay old credit balances.');
    expect(weeklyPage).toContain('Receipts may differ from sales when customers pay old credit balances.');
  });

  it('calculates receipt percentages from total receipts rather than invoice sales', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/page.tsx');
    const weeklyPage = readSource('app/(protected)/reports/weekly-digest/page.tsx');
    const weeklyService = readSource('lib/reports/weekly-digest.ts');

    expect(dashboard).toContain('const totalPaymentReceipts = Object.values(paymentSplit)');
    expect(dashboard).toContain('amount / totalPaymentReceipts');
    expect(weeklyService).toContain('totalReceiptsPence');
    expect(weeklyPage).toContain('amount / data.totalReceiptsPence');
  });

  it('excludes failed, cancelled, and void sales payment statuses from receipt splits', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/page.tsx');
    const weeklyService = readSource('lib/reports/weekly-digest.ts');

    expect(dashboard).toContain("status: { notIn: ['FAILED', 'CANCELLED', 'VOID'] }");
    expect(weeklyService).toContain("status: { notIn: ['FAILED', 'CANCELLED', 'VOID'] }");
  });

  it('describes cash variance as absolute variance from closed shifts', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/page.tsx');
    const weeklyPage = readSource('app/(protected)/reports/weekly-digest/page.tsx');
    const commandCenter = readSource('app/(protected)/reports/command-center/page.tsx');

    expect(dashboard).toContain('Closed Shift Cash Variance');
    expect(dashboard).toContain('Total absolute cash variance from shifts closed during this period.');
    expect(dashboard).toContain('closedAt: { gte: start, lte: end }');
    expect(dashboard).toContain('Math.abs(v.variance ?? 0)');
    expect(weeklyPage).toContain('Closed-shift variance');
    expect(commandCenter).toContain('closed-shift cash variance');
    expect(commandCenter).not.toContain('unreconciled cash variance');
  });

  it('keeps branch-selected expense and net profit scope explicit', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/page.tsx');

    expect(dashboard).toContain('Expenses and net profit are business-wide accounting journal totals.');
    expect(dashboard).toContain('helper={scopeHelper}');
  });

  it('keeps large stat values visible instead of forcing one-line clipping', () => {
    const statCard = readSource('components/StatCard.tsx');

    expect(statCard).toContain('overflow-visible');
    expect(statCard).toContain('[overflow-wrap:anywhere]');
    expect(statCard).not.toContain('whitespace-nowrap');
    expect(statCard).not.toContain('overflow-hidden rounded');
  });
});

describe('Reports navigation clarity', () => {
  it('groups report links into owner-friendly sections', () => {
    expect(REPORT_NAV_SECTIONS.map((section) => section.label)).toEqual([
      'Main',
      'Sales & Stock',
      'Finance',
      'Control',
      'Advanced',
    ]);
  });

  it('adds Weekly Digest and renamed report labels without changing routes', () => {
    const reports = NAV_GROUPS.find((group) => group.id === 'reports');
    expect(reports).toBeDefined();

    const items = reports!.items;
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: '/reports/dashboard', label: 'Trading Report' }),
      expect.objectContaining({ href: '/reports/weekly-digest', label: 'Weekly Digest' }),
      expect.objectContaining({ href: '/reports/sales-by-supplier', label: 'Sales by Linked Supplier' }),
      expect.objectContaining({ href: '/reports/cashflow', label: 'Cash Flow' }),
      expect.objectContaining({ href: '/reports/owner', label: 'Owner Brief' }),
      expect.objectContaining({ href: '/reports/cashflow-forecast', label: 'Cash Flow Forecast' }),
    ]));
  });

  it('preserves existing plan gates on grouped report routes', () => {
    const reports = NAV_GROUPS.find((group) => group.id === 'reports')!;
    const itemByHref = new Map(reports.items.map((item) => [item.href, item]));

    expect(itemByHref.get('/reports/analytics')?.minimumPlan).toBe('GROWTH');
    expect(itemByHref.get('/reports/income-statement')?.minimumPlan).toBe('GROWTH');
    expect(itemByHref.get('/reports/owner')?.minimumPlan).toBe('PRO');
    expect(itemByHref.get('/reports/audit-log')?.minimumPlan).toBe('PRO');
    expect(itemByHref.get('/reports/weekly-digest')?.minimumPlan).toBeUndefined();
  });

  it('renders grouped report sections in desktop and mobile navigation components', () => {
    const topNav = readSource('components/TopNav.tsx');
    const mobileNav = readSource('components/NavMobileMenu.tsx');

    expect(topNav).toContain('group.sections');
    expect(mobileNav).toContain('group.sections');
    expect(mobileNav).toContain('/reports/weekly-digest');
  });
});
