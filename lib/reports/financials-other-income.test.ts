import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: any) => fn,
}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    business: { findUniqueOrThrow: vi.fn() },
    journalLine: { groupBy: vi.fn() },
    account: { findMany: vi.fn() },
    salesInvoiceLine: { findMany: vi.fn() },
    openingBalance: { findMany: vi.fn() },
    store: { findMany: vi.fn() },
    inventoryBalance: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/accounting', () => ({
  ACCOUNT_CODES: {
    cash: '1000',
    bank: '1010',
    inventory: '1200',
    ap: '2000',
    sales: '4000',
    inventoryGain: '4100',
    cogs: '5000',
    inventoryLoss: '5100',
    vatReceivable: '1300',
    ar: '1100',
  },
}));
vi.mock('@/lib/reports/incomplete-stock', () => ({
  getIncompleteStockSnapshot: vi.fn().mockResolvedValue({
    stockValueIncomplete: false,
    profitMayBeIncomplete: false,
  }),
  incompleteStockDisclosureMessage: () => null,
}));

import { getBalanceSheet, getIncomeStatement } from './financials';

describe('other operating income (4100) reporting', () => {
  const bizId = 'biz-1';

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.business.findUniqueOrThrow.mockResolvedValue({
      id: bizId,
      openingCapitalPence: 0,
    });
    prismaMock.openingBalance.findMany.mockResolvedValue([]);
    prismaMock.store.findMany.mockResolvedValue([]);
    prismaMock.inventoryBalance.findMany.mockResolvedValue([]);
    prismaMock.account.findMany.mockResolvedValue([
      { id: 'acc-cash', code: '1000', name: 'Cash on Hand', type: 'ASSET' },
      { id: 'acc-inv', code: '1200', name: 'Inventory', type: 'ASSET' },
      { id: 'acc-sales', code: '4000', name: 'Sales Revenue', type: 'INCOME' },
      { id: 'acc-gain', code: '4100', name: 'Inventory Gain & Surplus', type: 'INCOME' },
      { id: 'acc-cogs', code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
      { id: 'acc-loss', code: '5100', name: 'Inventory Loss & Shrinkage', type: 'EXPENSE' },
    ]);
  });

  it('includes 4100 below gross profit and in net profit without inflating sales revenue', async () => {
    prismaMock.salesInvoiceLine.findMany.mockResolvedValue([
      {
        lineSubtotalPence: 10000,
        lineCostPence: 4000,
        qtyBase: 1,
        product: { defaultCostBasePence: 4000 },
      },
    ]);
    prismaMock.journalLine.groupBy.mockResolvedValue([
      { accountId: 'acc-gain', _sum: { debitPence: 0, creditPence: 500 } },
      { accountId: 'acc-loss', _sum: { debitPence: 200, creditPence: 0 } },
      { accountId: 'acc-sales', _sum: { debitPence: 0, creditPence: 99999 } },
    ]);

    const statement = await getIncomeStatement(bizId, new Date('2026-01-01'), new Date('2026-01-31'));

    expect(statement.revenue).toBe(10000);
    expect(statement.cogs).toBe(4000);
    expect(statement.grossProfit).toBe(6000);
    expect(statement.otherOperatingIncome).toBe(500);
    expect(statement.otherExpenses).toBe(200);
    expect(statement.netProfit).toBe(6000 - 200 + 500);
    // Journal sales credit must not become IS revenue.
    expect(statement.revenue).not.toBe(99999);
  });

  it('keeps balance sheet balanced and retains inventory gain via adjusted NP', async () => {
    prismaMock.salesInvoiceLine.findMany.mockResolvedValue([]);
    prismaMock.journalLine.groupBy.mockResolvedValue([
      { accountId: 'acc-inv', _sum: { debitPence: 500, creditPence: 0 } },
      { accountId: 'acc-gain', _sum: { debitPence: 0, creditPence: 500 } },
    ]);

    const sheet = await getBalanceSheet(bizId, new Date('2026-01-31'));
    const inventory = sheet.assets.find((a) => a.accountCode === '1200');
    expect(inventory?.balancePence).toBe(500);
    expect(sheet.totalAssets).toBe(sheet.totalLiabilities + sheet.totalEquity);
    const np = sheet.equity.find((e) => e.accountCode === 'CURRENT_PROFIT');
    expect(np?.balancePence).toBe(500);
  });
});

describe('sales KPI / VAT exclusion contracts', () => {
  it('today KPIs and VAT report remain sale-document based (no 4100 rollup)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const today = readFileSync(join(process.cwd(), 'lib/reports/today-kpis.ts'), 'utf8');
    const vat = readFileSync(join(process.cwd(), 'lib/exports/csv-writers.ts'), 'utf8');
    expect(today).toContain('salesInvoice');
    expect(today).not.toContain('4100');
    expect(today).not.toContain('inventoryGain');
    expect(vat).toContain('buildVatReportCsv');
    expect(vat).toContain('salesInvoice.aggregate');
    expect(vat).not.toContain('inventoryGain');
  });
});
