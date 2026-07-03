import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NAV_GROUPS, REPORT_NAV_SECTIONS } from '@/lib/navigation-config';

const root = process.cwd();
const readSource = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Reports dashboard clarity pass', () => {
  it('calculates receipt percentages from total receipts rather than invoice sales', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    const weeklyPage = readSource('app/(protected)/reports/weekly-digest/page.tsx');
    const weeklyService = readSource('lib/reports/weekly-digest.ts');

    expect(dashboard).toContain('const totalPaymentReceipts = Object.values(paymentSplit)');
    expect(dashboard).toContain('amount / totalPaymentReceipts');
    expect(weeklyService).toContain('totalReceiptsPence');
    expect(weeklyPage).toContain('amount / data.totalReceiptsPence');
  });

  it('excludes failed, cancelled, and void sales payment statuses from receipt splits', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    const weeklyService = readSource('lib/reports/weekly-digest.ts');

    expect(dashboard).toContain("status: { notIn: ['FAILED', 'CANCELLED', 'VOID'] }");
    expect(weeklyService).toContain("status: { notIn: ['FAILED', 'CANCELLED', 'VOID'] }");
  });

  it('describes cash variance with owner-friendly label and helper', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    const weeklyPage = readSource('app/(protected)/reports/weekly-digest/page.tsx');
    const commandCenter = readSource('app/(protected)/reports/command-center/page.tsx');

    // Phase 2A: label updated to owner-friendly wording
    expect(dashboard).toContain('Closed-shift cash difference');
    expect(dashboard).toContain('Difference between expected and counted cash from closed shifts.');
    // Calculation logic unchanged
    expect(dashboard).toContain('closedAt: { gte: start, lte: end }');
    expect(dashboard).toContain('Math.abs(v.variance ?? 0)');
    expect(weeklyPage).toContain('Closed-shift variance');
    expect(commandCenter).toContain('closed-shift cash variance');
    expect(commandCenter).not.toContain('unreconciled cash variance');
  });

  it('keeps branch-selected expense and net profit scope in expenses stat card', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');

    // Phase 2A: scopeHelper text updated to be more owner-friendly
    expect(dashboard).toContain('Expenses and net profit use the business-wide accounting records currently available.');
    expect(dashboard).toContain('helper={scopeHelper}');
  });

  it('keeps large stat values visible instead of forcing one-line clipping', () => {
    const statCard = readSource('components/StatCard.tsx');

    expect(statCard).toContain('overflow-visible');
    expect(statCard).toContain('[overflow-wrap:anywhere]');
    expect(statCard).not.toContain('whitespace-nowrap');
    expect(statCard).not.toContain('overflow-hidden rounded');
  });

  // Phase 2A: Trading Report label / copy clarity
  it('payment section heading uses owner-friendly "How money came in" label on both reports', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    const weeklyPage = readSource('app/(protected)/reports/weekly-digest/page.tsx');

    expect(dashboard).toContain('How money came in');
    expect(dashboard).not.toContain('Payment Receipts Split');
    // Phase 2B: Weekly Digest also updated to "How money came in"
    expect(weeklyPage).toContain('How money came in');
    expect(weeklyPage).not.toContain('Payment Receipts Split');
  });

  it('payment section helper clarifies receipts vs sales distinction on both reports', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    const weeklyPage = readSource('app/(protected)/reports/weekly-digest/page.tsx');

    expect(dashboard).toContain('can differ from sales when customers pay old credit');
    // Phase 2B: Weekly Digest uses consistent receipts distinction copy
    expect(weeklyPage).toContain('Receipts may include payments for older customer credit.');
  });

  it('"What customers owe" replaces "Debtors (AR)" label', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).toContain('What customers owe');
    expect(dashboard).not.toContain('Debtors (AR)');
  });

  it('"What you owe suppliers" replaces "Payables (AP)" label', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).toContain('What you owe suppliers');
    expect(dashboard).not.toContain('Payables (AP)');
  });

  it('"Profit before expenses" helper is present on Gross Profit stat card', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).toContain('Profit before expenses');
  });

  it('"Profit after expenses" helper is present on Net Profit stat card', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).toContain('Profit after expenses');
  });

  it('"Stock needing attention" replaces "Low Stock Alerts"', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).toContain('Stock needing attention');
    expect(dashboard).not.toContain('Low Stock Alerts');
  });

  it('"Best-selling products by revenue" replaces "Top Revenue Products"', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).toContain('Best-selling products by revenue');
    expect(dashboard).not.toContain('Top Revenue Products');
  });

  it('"Period activity highlights" replaces "Activity Highlights"', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).toContain('Period activity highlights');
    expect(dashboard).not.toContain('>Activity Highlights<');
  });

  it('period activity helper text is present', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).toContain('Returns, voids, and movement recorded during the selected period.');
  });

  it('customer debt helper clarifies current-state balance', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).toContain('Current customer credit balance');
    expect(dashboard).toContain('not just this period');
  });

  it('supplier payable helper clarifies current-state balance', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).toContain('Current supplier balances');
    expect(dashboard).toContain('Record supplier payments');
  });

  it('trust copy in filter info box clarifies sales and receipts distinction', () => {
    const dashboardPage = readSource('app/(protected)/reports/dashboard/page.tsx');
    expect(dashboardPage).toContain('Sales and receipts may differ');
    expect(dashboardPage).toContain('current position, not only this period');
  });

  it('date controls remain present and unchanged', () => {
    const dashboardPage = readSource('app/(protected)/reports/dashboard/page.tsx');
    expect(dashboardPage).toContain('name="from"');
    expect(dashboardPage).toContain('name="to"');
    expect(dashboardPage).toContain('name="storeId"');
  });

  it('existing action links remain present', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).toContain('/payments/customer-receipts');
    expect(dashboard).toContain('/payments/supplier-payments');
    expect(dashboard).toContain('cashDrawerHref');
    expect(dashboard).toContain('/reports/reorder-suggestions');
    expect(dashboard).toContain('/reports/analytics');
  });

  it('report service imports remain unchanged', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    const dashboardPage = readSource('app/(protected)/reports/dashboard/page.tsx');
    expect(dashboard).toContain("from '@/lib/reports/financials'");
    expect(dashboard).toContain("from '@/lib/reports/operational-metrics'");
    expect(dashboardPage).toContain("from '@/lib/reports/date-parsing'");
    expect(dashboard).toContain('getIncomeStatement');
    expect(dashboard).toContain('classifyInventoryState');
    expect(dashboardPage).toContain('resolveReportDateRange');
    expect(dashboard).toContain('computeOutstandingBalance');
  });

  it('sales aggregation and calculation logic is unchanged', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).toContain('salesAgg._sum.totalPence');
    expect(dashboard).toContain('outstandingAR');
    expect(dashboard).toContain('outstandingAP');
    expect(dashboard).toContain('paymentsByMethod');
    expect(dashboard).toContain('totalGrossMargin');
    expect(dashboard).toContain('income.otherExpenses');
  });

  it('does not add touch or pointer handlers', () => {
    const dashboard = readSource('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
    expect(dashboard).not.toContain('onPointerDown');
    expect(dashboard).not.toContain('onTouchStart');
    expect(dashboard).not.toContain('onTouchMove');
    expect(dashboard).not.toContain('onTouchEnd');
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

  it('does not duplicate report routes across grouped navigation sections', () => {
    const reportHrefs = REPORT_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.href));
    expect(new Set(reportHrefs).size).toBe(reportHrefs.length);
  });

  it('renders grouped report sections in desktop navigation and launcher browse areas on mobile', () => {
    const topNav = readSource('components/TopNav.tsx');
    const mobileNav = readSource('components/NavMobileMenu.tsx');
    const mobileConfig = readSource('lib/navigation/mobile-menu-config.ts');

    expect(topNav).toContain('group.sections');
    expect(mobileNav).toContain('getOwnerLauncherMenu');
    expect(mobileConfig).toContain("label: 'Reports Hub'");
    expect(mobileConfig).toContain("href: '/reports/analytics'");
  });

  it('keeps the desktop Reports dropdown compact and scroll-safe', () => {
    const topNav = readSource('components/TopNav.tsx');
    const reportsPanelClass = topNav.match(/\? '([^']*overflow-y-auto[^']*\[scrollbar-gutter:stable\][^']*)'/)?.[1] ?? '';

    expect(topNav).toContain("group.id === 'reports'");
    expect(topNav).toContain("['main', 'sales-stock', 'finance']");
    expect(topNav).toContain("['control', 'advanced']");
    expect(topNav).toContain('absolute left-1/2 top-full');
    expect(topNav).toContain('-translate-x-1/2');
    expect(topNav).toContain('w-[min(38rem,calc(100vw_-_2rem))]');
    expect(topNav).toContain('max-h-[calc(100vh_-_var(--app-header-offset-desktop)_-_1.25rem)]');
    expect(topNav).toContain('overflow-y-auto');
    expect(topNav).toContain('overscroll-contain');
    expect(topNav).toContain('grid grid-cols-2');
    expect(topNav).toContain('[scrollbar-gutter:stable]');
    expect(reportsPanelClass).toContain('overflow-y-auto');
    expect(reportsPanelClass).toContain('[scrollbar-gutter:stable]');
  });

  it('keeps desktop nav interaction accessible enough for keyboard and click users', () => {
    const topNav = readSource('components/TopNav.tsx');

    expect(topNav).toContain("event.key === 'Escape'");
    expect(topNav).toContain('setOpenGroup(null)');
    expect(topNav).toContain('onClick={() => setOpenGroup(null)}');
    expect(topNav).toContain('shell-nav-link-active');
  });

  it('keeps smaller desktop dropdowns compact, animated, and active-aware', () => {
    const topNav = readSource('components/TopNav.tsx');
    const styles = readSource('app/globals.css');
    const smallPanelClass = topNav.match(/: '([^']*shell-dropdown-panel-small[^']*)'/)?.[1] ?? '';
    const stock = NAV_GROUPS.find((group) => group.id === 'stock')!;

    expect(topNav).toContain('w-[min(23rem,calc(100vw_-_2rem))]');
    expect(topNav).toContain('max-h-[calc(100vh_-_var(--app-header-offset-desktop)_-_1.25rem)]');
    expect(topNav).toContain('dropdown-motion');
    expect(topNav).toContain('shell-nav-link-active');
    expect(topNav).toContain('shell-nav-card-link');
    expect(topNav).toContain('item.description');
    expect(smallPanelClass).toContain('shell-dropdown-panel-small');
    expect(smallPanelClass).not.toContain('overflow-y-auto');
    expect(smallPanelClass).not.toContain('[scrollbar-gutter:stable]');
    expect(stock.items.map((item) => item.label)).toEqual([
      'Inventory',
      'Stock Adjustments',
      'Stock Movements',
      'Purchases',
      'Transfers',
      'Products',
      'Product Labels',
    ]);
    expect(styles).toContain('@keyframes dropdown-in');
    expect(styles).toContain('.dropdown-motion');
    expect(styles).toContain('.shell-dropdown-panel-small');
    expect(styles).toContain('@media (max-height: 700px)');
    expect(styles).toContain('scrollbar-gutter: stable');
    expect(styles).toContain('.shell-nav-card-link');
    expect(styles).toContain('.shell-nav-icon-badge');
    expect(styles).toContain('.shell-nav-trigger-active:hover');
    expect(styles).toContain('text-blue-900');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('adds desktop navigation icon metadata and descriptions without moving routes', () => {
    const config = readSource('lib/navigation-config.ts');
    const topNav = readSource('components/TopNav.tsx');
    const navIcon = readSource('components/navigation/NavIcon.tsx');
    const stock = NAV_GROUPS.find((group) => group.id === 'stock')!;
    const reports = NAV_GROUPS.find((group) => group.id === 'reports')!;

    expect(config).toContain('export type NavIconKey');
    expect(config).toContain('iconKey?: NavIconKey');
    expect(config).toContain('description?: string');
    expect(navIcon).toContain('ICON_PATHS');
    expect(navIcon).toContain('fallback');
    expect(topNav).toContain("import NavIcon from './navigation/NavIcon'");
    expect(topNav).toContain('<NavIcon');

    expect(stock.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: '/inventory', label: 'Inventory', iconKey: 'inventory', description: 'View stock levels and reorder needs.' }),
      expect.objectContaining({ href: '/purchases', label: 'Purchases', iconKey: 'purchases', description: 'Receive stock and supplier invoices.' }),
      expect.objectContaining({ href: '/products', label: 'Products', iconKey: 'products', description: 'Manage catalogue, prices, and barcodes.' }),
      expect.objectContaining({ href: '/products/labels', label: 'Product Labels', iconKey: 'labels', description: 'Print product and shelf labels.' }),
    ]));
    expect(reports.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: '/reports/owner', label: 'Owner Brief', iconKey: 'ownerBrief' }),
      expect.objectContaining({ href: '/reports/cashflow-forecast', label: 'Cash Flow Forecast', iconKey: 'forecast' }),
    ]));
    expect(reports.items.every((item) => item.description === undefined)).toBe(true);
  });

  it('keeps plan, role, feature gates and mobile nav stable after desktop polish', () => {
    const mobileNav = readSource('components/NavMobileMenu.tsx');
    const allHrefs = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    const sell = NAV_GROUPS.find((group) => group.id === 'sell')!;
    const stock = NAV_GROUPS.find((group) => group.id === 'stock')!;
    const reports = NAV_GROUPS.find((group) => group.id === 'reports')!;

    expect(new Set(allHrefs).size).toBe(allHrefs.length);
    expect(sell.items.find((item) => item.href === '/online-orders')?.requiresFeature).toBe('onlineStorefront');
    expect(stock.items.find((item) => item.href === '/products/labels')?.minimumPlan).toBe('GROWTH');
    expect(reports.items.find((item) => item.href === '/reports/owner')?.minimumPlan).toBe('PRO');
    expect(reports.items.find((item) => item.href === '/reports/audit-log')?.roles).toEqual(['OWNER']);
    expect(mobileNav).toContain('NavIcon');
    expect(mobileNav).toContain('Browse by area');
  });

  it('adds a People hub without duplicating navigation routes', () => {
    const people = NAV_GROUPS.find((group) => group.id === 'relationships');
    expect(people).toBeDefined();
    expect(people!.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: '/people', label: 'People Hub' }),
      expect.objectContaining({ href: '/customers', label: 'Customers' }),
      expect.objectContaining({ href: '/suppliers', label: 'Suppliers' }),
    ]));

    const allHrefs = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    expect(new Set(allHrefs).size).toBe(allHrefs.length);
  });

  it('renders People module cards and payment actions', () => {
    const peoplePage = readSource('app/(protected)/people/page.tsx');

    expect(peoplePage).toContain('Manage customers, suppliers, balances, and relationships.');
    expect(peoplePage).toContain('Customers');
    expect(peoplePage).toContain('Suppliers');
    expect(peoplePage).toContain('Customer payments');
    expect(peoplePage).toContain('Supplier payments');
    expect(peoplePage).toContain('/payments/customer-receipts');
    expect(peoplePage).toContain('/payments/supplier-payments');
    expect(peoplePage).toContain('module-card');
    expect(peoplePage).toContain('stagger-children');
  });
});
