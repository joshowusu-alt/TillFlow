import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, REPORT_NAV_SECTIONS } from '@/lib/navigation-config';
import { OWNER_BROWSE_AREAS, MANAGER_MENU_SECTIONS } from '@/lib/navigation/mobile-menu-config';
import { applyRefundsToMethods, refundDeductionPence } from '@/lib/reports/today/money-net';
import { reportReturnPaths, safeReturnStoreId, STAGE_3A_WITHHELD_HREFS } from '@/lib/reports/today/stage3a-nav';

const root = process.cwd();

function walk(dir: string, files: string[]) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(tsx|ts)$/.test(entry) && !entry.includes('.test.')) files.push(full);
  }
}

describe('Stage 3A navigation correction', () => {
  it('limits the Reports header and mobile menus to Today, Activity and More reports', () => {
    const header = REPORT_NAV_SECTIONS.flatMap((section) => section.items.map((item) => `${item.label} ${item.href}`));
    expect(header).toEqual([
      'Today /reports',
      'Activity /reports?section=activity',
      'More reports /reports?section=more',
    ]);
    const reports = NAV_GROUPS.find((group) => group.id === 'reports');
    expect(reports?.items).toHaveLength(3);
    const mobile = [...OWNER_BROWSE_AREAS, ...MANAGER_MENU_SECTIONS]
      .filter((area) => area.id === 'reports' || area.id === 'reports-settings')
      .flatMap((area) => area.items.map((item) => item.href));
    expect(mobile).toEqual([
      '/reports',
      '/reports?section=activity',
      '/reports?section=more',
      '/reports',
      '/reports?section=activity',
      '/reports?section=more',
      '/settings',
      '/account',
    ]);
    const topNav = readFileSync(join(root, 'components/TopNav.tsx'), 'utf8');
    expect(topNav).toContain("href={operationalHref('/reports')}");
    expect(topNav).toContain("group.id === 'reports'");
  });

  it('gives every Activity and More destination a return path and drops an invalid store id', () => {
    const paths = reportReturnPaths();
    const hrefs = paths.map((path) => path.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual(expect.arrayContaining([
      '/reports/dashboard',
      '/reports/stock-movements',
      '/reports/margins',
      '/reports/money-received',
      '/reports/cash-drawer',
      '/settings/online-store/analytics',
      '/reports/income-statement',
      '/reports/exports',
    ]));
    for (const href of STAGE_3A_WITHHELD_HREFS) expect(hrefs).not.toContain(href);
    expect(paths.find((path) => path.href === '/reports/stock-movements')).toMatchObject({
      section: 'activity',
      backLabel: 'Back to Activity',
    });
    expect(paths.find((path) => path.href === '/reports/income-statement')).toMatchObject({
      section: 'more',
      backLabel: 'Back to More reports',
    });
    expect(safeReturnStoreId('?storeId=store-a', ['store-a'])).toBe('store-a');
    expect(safeReturnStoreId('?storeId=ALL', ['store-a'])).toBeNull();
    expect(safeReturnStoreId('?storeId=store-a&storeId=store-b', ['store-a', 'store-b'])).toBeNull();
    expect(safeReturnStoreId('?storeId=foreign', ['store-a'])).toBeNull();
    expect(safeReturnStoreId('?storeId=', ['store-a'])).toBeNull();
  });

  it('shows no figures on the withheld direct routes', () => {
    const balance = readFileSync(join(root, 'app/(protected)/reports/balance-sheet/page.tsx'), 'utf8');
    const forecast = readFileSync(join(root, 'app/(protected)/reports/cashflow-forecast/page.tsx'), 'utf8');
    const cashflow = readFileSync(join(root, 'app/(protected)/reports/cashflow/page.tsx'), 'utf8');
    expect(balance).toContain('This statement is withheld');
    expect(balance).toContain('openLiveReport');
    expect(balance).not.toContain('getBalanceSheet');
    expect(balance).not.toContain('formatMoney');
    expect(forecast).toContain('This estimate is withheld');
    expect(forecast).not.toContain('getCashflowForecast');
    expect(forecast).not.toContain('formatMoney');
    expect(cashflow).toContain('not on the reliable list');
    expect(cashflow).toContain('openLiveReport');
    expect(cashflow).not.toContain('getCashflow(');
  });

  it('does not link withheld reports from customer screens', () => {
    const files: string[] = [];
    walk(join(root, 'app'), files);
    walk(join(root, 'components'), files);
    const hits = files.filter((file) => {
      const normalised = file.replace(/\\/g, '/');
      if (normalised.includes('/app/actions/')) return false;
      const source = readFileSync(file, 'utf8');
      return STAGE_3A_WITHHELD_HREFS.some((href) => source.includes(`'${href}'`) || source.includes(`"${href}"`) || source.includes(`\`${href}`));
    }).map((file) => file.slice(root.length + 1));
    expect(hits).toEqual([]);
  });
});

describe('Today money received after completed refunds', () => {
  it('deducts a completed refund and leaves a reversed receipt alone', () => {
    expect(refundDeductionPence({
      refundAmountPence: 800,
      refundMethod: 'CASH',
      confirmedAmountsPence: [800],
    })).toBe(800);
    expect(refundDeductionPence({
      refundAmountPence: 800,
      refundMethod: 'CASH',
      confirmedAmountsPence: [800, -800],
    })).toBe(0);
    expect(refundDeductionPence({
      refundAmountPence: 0,
      refundMethod: 'CASH',
      confirmedAmountsPence: [800],
    })).toBe(0);

    const net = applyRefundsToMethods(
      [
        { method: 'CASH', amountPence: 1500 },
        { method: 'MOBILE_MONEY', amountPence: 700 },
      ],
      [{ refundAmountPence: 400, refundMethod: 'CASH', confirmedAmountsPence: [1500] }],
    );
    expect(net).toEqual([
      { method: 'CASH', amountPence: 1100 },
      { method: 'MOBILE_MONEY', amountPence: 700 },
    ]);
  });

  it('refuses a completed refund that has no payment method', () => {
    expect(() => applyRefundsToMethods(
      [{ method: 'CASH', amountPence: 500 }],
      [{ refundAmountPence: 200, refundMethod: null, confirmedAmountsPence: [] }],
    )).toThrow(/payment method/);
  });
});
