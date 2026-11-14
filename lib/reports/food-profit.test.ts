import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  salesInvoice: { findMany: vi.fn() },
  journalLine: { aggregate: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { loadTradingPeriodMargin } from './trading-margin';

const period = { businessId: 'fixture', startInclusive: new Date(0), endExclusive: new Date(1000) };
const invoice = { paymentStatus: 'PAID', discountPence: 0, salesReturn: null, lines: [{
  lineSubtotalPence: 36000, lineDiscountPence: 0, promoDiscountPence: 0, lineCostPence: 0,
  costBasis: 'INVENTORY_VALUE_V1', qtyBase: 18, product: { defaultCostBasePence: 500 },
}] };

describe('period gross profit', () => {
  it('uses GH₵90 net food costs and GH₵10 waste in trading in the trading dashboard data', async () => {
    db.salesInvoice.findMany.mockResolvedValue([invoice]);
    db.journalLine.aggregate.mockResolvedValue({ _sum: { debitPence: 11000, creditPence: 1000 } });
    const food = { ...period, businessCategory: 'FOOD_DISHES' };
    expect(await loadTradingPeriodMargin(food)).toMatchObject({ grossProfitPence: 26000, grossProfitPercent: 72 });
    expect(await loadTradingPeriodMargin({ ...food, storeId: 'branch' })).toMatchObject({
      grossProfitPence: null, grossProfitPercent: null, seeProfitAndLoss: true,
    });
  });

  it('leaves retail gross profit alone and skips the food ledger entirely', async () => {
    db.journalLine.aggregate.mockClear();
    db.salesInvoice.findMany.mockResolvedValue([{ ...invoice, lines: [{ ...invoice.lines[0], lineCostPence: 12000 }] }]);
    expect(await loadTradingPeriodMargin({ ...period, storeId: 'branch', businessCategory: 'RETAIL' })).toEqual({
      state: 'READY', grossProfitPence: 24000, grossProfitPercent: 67, incompleteLineCount: 0,
    });
    expect(db.journalLine.aggregate).not.toHaveBeenCalled();
  });
});
