import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, REPORT_NAV_SECTIONS } from '@/lib/navigation-config';

const root = process.cwd();
const src = readFileSync(join(root, 'app/(protected)/reports/page.tsx'), 'utf8');

function reportHrefs() {
  return Array.from(src.matchAll(/href: '([^']+)'/g)).map((match) => match[1]);
}

describe('Reports Hub index polish', () => {
  it('renders a real Reports hub instead of redirecting to Command Center', () => {
    expect(src).toContain('export default async function ReportsIndexPage');
    expect(src).toContain('title="Reports"');
    expect(src).not.toContain("import { redirect } from 'next/navigation'");
    expect(src).not.toContain("redirect('/reports/command-center')");
  });

  it('renders owner-friendly subtitle and trust context copy', () => {
    expect(src).toContain('Choose the report you need to understand sales, cash, stock, debts, suppliers, and business performance.');
    expect(src).toContain('Period controls appear inside reports that support date filtering.');
    expect(src).toContain('Branch or store filters appear where branch filtering is supported.');
    expect(src).toContain('Downloads share records without changing the report figures.');
    expect(src).toContain('Daily reports guide action; finance reports support review and planning.');
    expect(src).toContain('Reports are based on the records entered in TillFlow.');
  });

  it('adds Reports Hub to the top Reports dropdown before Command Center', () => {
    const reports = NAV_GROUPS.find((group) => group.id === 'reports');
    const main = REPORT_NAV_SECTIONS.find((section) => section.id === 'main');

    expect(reports).toBeDefined();
    expect(main?.items[0]).toEqual(expect.objectContaining({
      href: '/reports',
      label: 'Reports Hub',
      roles: ['MANAGER', 'OWNER'],
      iconKey: 'reportsHub',
    }));
    expect(main?.items[1]).toEqual(expect.objectContaining({ href: '/reports/command-center', label: 'Command Center' }));
    expect(reports!.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: '/reports', label: 'Reports Hub' }),
      expect.objectContaining({ href: '/reports/dashboard', label: 'Trading Report' }),
      expect.objectContaining({ href: '/reports/weekly-digest', label: 'Weekly Digest' }),
      expect.objectContaining({ href: '/reports/exports', label: 'Exports' }),
    ]));
  });

  it('renders a compact Start here row with key owner paths', () => {
    expect(src).toContain('const startHereCards');
    expect(src).toContain('Start here');
    expect(src).toContain('See what needs attention now.');
    expect(src).toContain('Review sales, receipts, debts, payables, and performance.');
    expect(src).toContain('Check expected cash, counted cash, and differences.');
    expect(src).toContain('Download records for your accountant or team.');
    expect(src).toContain('lg:grid-cols-4');
  });

  it('renders the approved owner-friendly report groups', () => {
    expect(src).toContain("title: 'Daily Action'");
    expect(src).toContain("title: 'Sales & Payments'");
    expect(src).toContain("title: 'Stock & Purchases'");
    expect(src).toContain("title: 'Customers & Suppliers'");
    expect(src).toContain("title: 'Cash & Profit'");
    expect(src).toContain("title: 'Exports & Control'");
  });

  it('keeps key existing report links intact', () => {
    expect(src).toContain("href: '/reports/command-center'");
    expect(src).toContain("href: '/reports/dashboard'");
    expect(src).toContain("href: '/reports/cash-drawer'");
    expect(src).toContain("href: '/reports/reorder-suggestions'");
    expect(src).toContain("href: '/reports/stock-movements'");
    expect(src).toContain("href: '/reports/sales-by-supplier'");
    expect(src).toContain("href: '/reports/exports'");
    expect(src).toContain("href: '/reports/audit-log'");
  });

  it('uses verified people payment routes without inventing customer aging', () => {
    expect(src).toContain("href: '/payments/customer-receipts'");
    expect(src).toContain("href: '/payments/supplier-aging'");
    expect(src).toContain("href: '/payments/supplier-payments'");
    expect(src).not.toContain('/payments/customer-aging');
  });

  it('separates supplier sales performance from supplier debt', () => {
    expect(src).toContain("label: 'Sales by Linked Supplier'");
    expect(src).toContain('This is not supplier debt.');
    expect(src).toContain("label: 'What you owe suppliers'");
  });

  it('uses only verified routes for report cards', () => {
    const allowedRoutes = new Set([
      '/reports/command-center',
      '/reports/owner',
      '/reports/weekly-digest',
      '/reports/risk-monitor',
      '/reports/dashboard',
      '/reports/analytics',
      '/reports/cash-drawer',
      '/reports/reorder-suggestions',
      '/reports/stock-movements',
      '/reports/sales-by-supplier',
      '/payments/customer-receipts',
      '/payments/supplier-aging',
      '/payments/supplier-payments',
      '/reports/margins',
      '/reports/income-statement',
      '/reports/cashflow',
      '/reports/balance-sheet',
      '/reports/cashflow-forecast',
      '/reports/exports',
      '/reports/audit-log',
    ]);

    expect(reportHrefs().every((href) => allowedRoutes.has(href))).toBe(true);
  });

  it('does not import report calculation services, actions, Prisma, or export routes', () => {
    expect(src).not.toContain('@/lib/reports/');
    expect(src).not.toContain('@/app/actions/');
    expect(src).not.toContain('@/lib/prisma');
    expect(src).not.toContain('/exports/');
    expect(src).not.toContain('/api/reports/');
  });

  it('keeps the hub static/navigation-focused with responsive mobile polish', () => {
    expect(src).toContain('type ReportIconName');
    expect(src).toContain('const iconPaths');
    expect(src).toContain('function ReportIcon');
    expect(src).toContain('inline-flex h-9 w-9 shrink-0 items-center justify-center');
    expect(src).toContain('rounded-3xl border border-slate-200/75 bg-slate-50/45');
    expect(src).toContain('sm:grid-cols-2');
    expect(src).toContain('xl:grid-cols-4');
    expect(src).toContain('md:grid-cols-2');
    expect(src).toContain('xl:grid-cols-3');
    expect(src).toContain('active:scale-[0.98]');
    expect(src).toContain('motion-reduce:active:scale-100');
    expect(src).not.toContain('onPointerDown');
    expect(src).not.toContain('onTouchStart');
    expect(src).not.toContain('onTouchMove');
    expect(src).not.toContain('onTouchEnd');
  });
});
