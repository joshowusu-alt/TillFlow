import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    business: { findUniqueOrThrow: vi.fn() },
    journalLine: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/accounting', () => ({
  ACCOUNT_CODES: {
    cash: '1000', bank: '1010', inventory: '1200', ap: '2000',
    cogs: '5000', vatReceivable: '1300', ar: '1100',
  },
}));

import { getBalanceSheet } from './financials';

describe('getBalanceSheet asOf filtering', () => {
  const bizId = 'biz-1';

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.business.findUniqueOrThrow.mockResolvedValue({
      id: bizId,
      openingCapitalPence: 0,
    });
  });

  it('returns zero totals when no journal entries exist', async () => {
    prismaMock.journalLine.findMany.mockResolvedValue([]);

    const sheet = await getBalanceSheet(bizId, new Date('2024-12-31'));

    expect(sheet.totalAssets).toBe(0);
    expect(sheet.totalLiabilities).toBe(0);
    expect(sheet.totalEquity).toBe(0);
    expect(sheet.assets).toHaveLength(0);
    expect(sheet.liabilities).toHaveLength(0);
    expect(sheet.equity).toHaveLength(0);
  });

  it('correctly classifies assets and liabilities from journal lines', async () => {
    prismaMock.journalLine.findMany.mockResolvedValue([
      {
        account: { id: 'acc-cash', code: '1000', name: 'Cash on Hand', type: 'ASSET' },
        debitPence: 50000,
        creditPence: 0,
      },
      {
        account: { id: 'acc-inv', code: '1200', name: 'Inventory', type: 'ASSET' },
        debitPence: 30000,
        creditPence: 0,
      },
      {
        account: { id: 'acc-ap', code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
        debitPence: 0,
        creditPence: 20000,
      },
    ]);

    const sheet = await getBalanceSheet(bizId, new Date('2024-12-31'));

    expect(sheet.totalAssets).toBe(80000); // 50000 + 30000
    expect(sheet.totalLiabilities).toBe(20000);
    expect(sheet.assets).toHaveLength(2);
    expect(sheet.liabilities).toHaveLength(1);
  });

  it('passes asOf date to journalLine query for correct filtering', async () => {
    prismaMock.journalLine.findMany.mockResolvedValue([]);

    const asOf = new Date('2024-06-15');
    await getBalanceSheet(bizId, asOf);

    expect(prismaMock.journalLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          journalEntry: {
            businessId: bizId,
            entryDate: { lte: asOf },
          },
        },
      })
    );
  });

  it('includes opening capital in assets and equity when set', async () => {
    prismaMock.business.findUniqueOrThrow.mockResolvedValue({
      id: bizId,
      openingCapitalPence: 100000,
    });
    prismaMock.journalLine.findMany.mockResolvedValue([]);

    const sheet = await getBalanceSheet(bizId, new Date('2024-12-31'));

    // Opening capital shows as Cash on Hand asset
    expect(sheet.totalAssets).toBe(100000);
    // Owner's Capital appears in equity
    const ownerCapital = sheet.equity.find(e => e.accountCode === 'OWNER_CAPITAL');
    expect(ownerCapital).toBeTruthy();
    expect(ownerCapital!.balancePence).toBe(100000);
    // Balance sheet should balance: assets = liabilities + equity
    expect(sheet.totalAssets).toBe(sheet.totalLiabilities + sheet.totalEquity);
  });

  it('includes net income in equity when income/expense entries exist', async () => {
    prismaMock.journalLine.findMany.mockResolvedValue([
      {
        account: { id: 'acc-revenue', code: '4000', name: 'Sales Revenue', type: 'INCOME' },
        debitPence: 0,
        creditPence: 100000,
      },
      {
        account: { id: 'acc-cogs', code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
        debitPence: 60000,
        creditPence: 0,
      },
    ]);

    const sheet = await getBalanceSheet(bizId, new Date('2024-12-31'));

    const currentProfit = sheet.equity.find(e => e.accountCode === 'CURRENT_PROFIT');
    expect(currentProfit).toBeTruthy();
    // Net income = revenue (100000) - expenses (60000) = 40000
    expect(currentProfit!.balancePence).toBe(40000);
  });
});
