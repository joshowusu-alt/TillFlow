import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCashierMySalesWhere,
  CASHIER_MY_SALES_ROUTE,
  summarizePaymentMethods,
} from '@/lib/services/cashier-my-sales';
import {
  CASHIER_HAS_MY_ACCOUNT_ROUTE,
  CASHIER_MY_ACCOUNT_HREF,
  getBottomTabsForRole,
} from '@/lib/navigation/mobile-menu-config';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('cashier My Sales access', () => {
  const mySalesPage = read('app/(protected)/my-sales/page.tsx');
  const salesPage = read('app/(protected)/sales/page.tsx');
  const returnPage = read('app/(protected)/sales/return/[id]/page.tsx');
  const returnsAction = read('app/actions/returns.ts');
  const receiptPage = read('app/receipts/[id]/page.tsx');

  it('scopes My Sales queries to the current cashier only', () => {
    const where = buildCashierMySalesWhere({
      businessId: 'biz-1',
      cashierUserId: 'cashier-1',
      from: '2026-07-01',
      to: '2026-07-03',
    });

    expect(where.businessId).toBe('biz-1');
    expect(where.cashierUserId).toBe('cashier-1');
    expect(where.createdAt?.gte).toEqual(new Date('2026-07-01'));
    expect(where.createdAt?.lte).toEqual(new Date('2026-07-03T23:59:59.999'));
    expect(mySalesPage).toContain('cashierUserId: user.id');
    expect(mySalesPage).toContain('buildCashierMySalesWhere');
  });

  it('keeps business sales and return routes manager/owner only', () => {
    expect(salesPage).toContain("requireBusiness(['MANAGER', 'OWNER'])");
    expect(returnPage).toContain("requireBusiness(['MANAGER', 'OWNER'])");
    expect(returnsAction).toContain("withBusinessContext(['MANAGER', 'OWNER'])");
    expect(mySalesPage).toContain("redirect('/sales')");
  });

  it('keeps cashier My Sales read-only and receipt access scoped to own sales', () => {
    expect(mySalesPage).not.toContain('/sales/amend/');
    expect(mySalesPage).not.toContain('/sales/return/');
    expect(mySalesPage).not.toContain('InlinePaymentForm');
    expect(mySalesPage).toContain('Read-only');
    expect(receiptPage).toContain("user.role === 'CASHIER' && invoice.cashierUserId !== user.id");
    expect(receiptPage).toContain("user.role !== 'CASHIER' && !isReturned");
  });

  it('uses a distinct My Sales route separate from My Shift', () => {
    expect(CASHIER_MY_SALES_ROUTE).toBe('/my-sales');
    const tabs = getBottomTabsForRole('CASHIER');
    const hrefs = tabs.filter((tab) => tab.href).map((tab) => tab.href!);

    expect(tabs.map((tab) => tab.label)).toEqual(['POS', 'My Sales', 'My Shift', 'Account', 'More']);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain('/my-sales');
    expect(hrefs).toContain('/shifts');
    expect(hrefs).not.toContain('/products');
    expect(hrefs).not.toContain('/reports');
    expect(hrefs).not.toContain('/settings');
    expect(hrefs).not.toContain('/users');
    if (CASHIER_HAS_MY_ACCOUNT_ROUTE) {
      expect(hrefs).toContain(CASHIER_MY_ACCOUNT_HREF);
    }
  });

  it('summarizes payment methods for the read-only list', () => {
    expect(
      summarizePaymentMethods([
        { method: 'CASH', amountPence: 1000 },
        { method: 'CASH', amountPence: 500 },
        { method: 'MOBILE_MONEY', amountPence: 2500 },
      ]),
    ).toEqual([
      { method: 'CASH', amountPence: 1500 },
      { method: 'MOBILE_MONEY', amountPence: 2500 },
    ]);
  });
});
