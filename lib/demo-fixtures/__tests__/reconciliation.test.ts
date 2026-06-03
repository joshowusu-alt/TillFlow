import { describe, it, expect, beforeAll } from 'vitest';
import { buildDemoLedger } from '../build-demo-ledger';
import { getDebtorBalances, getSupplierPayables, getIncomeStatement, getCashFlow } from '../reports';
import type { DemoSnapshot } from '../types';

let s: DemoSnapshot;

beforeAll(() => {
  s = buildDemoLedger();
});

describe('Demo fixture – products', () => {
  it('has exactly 100 products', () => {
    expect(s.products).toHaveLength(100);
  });

  it('covers all 10 categories', () => {
    const catIds = new Set(s.products.map(p => p.categoryId));
    expect(catIds.size).toBe(10);
  });

  it('every product has a positive cost and selling price', () => {
    for (const p of s.products) {
      expect(p.costPricePence).toBeGreaterThan(0);
      expect(p.sellingPricePence).toBeGreaterThan(0);
    }
  });

  it('selling price is always >= cost price', () => {
    for (const p of s.products) {
      expect(p.sellingPricePence).toBeGreaterThanOrEqual(p.costPricePence);
    }
  });

  it('every product has an image path', () => {
    for (const p of s.products) {
      expect(p.imagePath).toBeTruthy();
    }
  });
});

describe('Demo fixture – inventory reconciliation', () => {
  it('every product has an inventory balance entry', () => {
    for (const p of s.products) {
      expect(s.inventoryBalances.has(p.id)).toBe(true);
    }
  });

  it('ending qty = opening + purchased − sold for every product', () => {
    for (const p of s.products) {
      const bal = s.inventoryBalances.get(p.id)!;
      expect(bal.endingQty).toBe(bal.openingQty + bal.purchasedQty - bal.soldQty);
    }
  });

  it('no product ends with negative stock', () => {
    for (const [, bal] of s.inventoryBalances) {
      expect(bal.endingQty).toBeGreaterThanOrEqual(0);
    }
  });

  it('totals.endingInventoryValuePence = sum(endingQty * costPrice)', () => {
    const expected = s.products.reduce((sum, p) => {
      const bal = s.inventoryBalances.get(p.id)!;
      return sum + bal.endingQty * p.costPricePence;
    }, 0);
    expect(s.totals.endingInventoryValuePence).toBe(expected);
  });
});

describe('Demo fixture – supplier payables reconciliation', () => {
  it('AP balance equals sum of outstanding purchase invoices', () => {
    const outstanding = s.purchaseInvoices.reduce(
      (sum, po) => sum + (po.totalPence - po.paidPence),
      0,
    );
    expect(s.totals.apBalancePence).toBe(outstanding);
  });

  it('getSupplierPayables only includes invoices with outstanding amounts', () => {
    const payables = getSupplierPayables(s);
    for (const r of payables) {
      expect(r.outstandingPence).toBeGreaterThan(0);
    }
  });

  it('sum of getSupplierPayables outstanding equals totals.apBalancePence', () => {
    const payables = getSupplierPayables(s);
    const sum = payables.reduce((a, r) => a + r.outstandingPence, 0);
    expect(sum).toBe(s.totals.apBalancePence);
  });
});

describe('Demo fixture – debtor (AR) reconciliation', () => {
  it('AR balance = credit sales − credit collected', () => {
    expect(s.totals.arBalancePence).toBe(
      Math.max(0, s.totals.creditSalesPence - s.totals.creditCollectedPence),
    );
  });

  it('sum of debtor balances equals totals.arBalancePence', () => {
    const debtors = getDebtorBalances(s);
    const sum = debtors.reduce((a, r) => a + r.balancePence, 0);
    expect(sum).toBe(s.totals.arBalancePence);
  });

  it('credit collected matches sum of customerReceipts', () => {
    const collected = s.customerReceipts.reduce((a, r) => a + r.amountPence, 0);
    expect(s.totals.creditCollectedPence).toBe(collected);
  });
});

describe('Demo fixture – gross profit reconciliation', () => {
  it('gross profit = revenue − COGS', () => {
    expect(s.totals.grossProfitPence).toBe(
      s.totals.totalRevenuePence - s.totals.totalCOGSPence,
    );
  });

  it('COGS = sum over all sales lines of qty × costPrice', () => {
    const expected = s.salesInvoices.reduce((sum, inv) =>
      sum + inv.lines.reduce((s2, l) => s2 + l.qty * l.costPricePence, 0),
      0,
    );
    expect(s.totals.totalCOGSPence).toBe(expected);
  });

  it('revenue = sum of all invoice subtotals', () => {
    const expected = s.salesInvoices.reduce((a, i) => a + i.subtotalPence, 0);
    expect(s.totals.totalRevenuePence).toBe(expected);
  });

  it('getIncomeStatement returns consistent values', () => {
    const is = getIncomeStatement(s);
    expect(is.grossProfitPence).toBe(is.revenuePence - is.cogsPence);
    expect(is.netProfitPence).toBe(is.grossProfitPence - is.expensesPence);
  });
});

describe('Demo fixture – cash position reconciliation', () => {
  it('cash sales + momo sales + credit sales = total revenue', () => {
    expect(
      s.totals.cashSalesPence +
        s.totals.momoSalesPence +
        s.totals.cardSalesPence +
        s.totals.creditSalesPence
    ).toBe(s.totals.totalRevenuePence);
  });

  it('endingCashPence = opening + cashSales + creditCollected − purchasesPaid − expenses', () => {
    const expected = s.totals.openingCashPence
      + s.totals.cashSalesPence
      + s.totals.creditCollectedPence
      - s.totals.purchasesPaidPence
      - s.totals.totalExpensesPence;
    expect(s.totals.endingCashPence).toBe(expected);
  });

  it('getCashFlow totalLiquid = endingCash + endingMomo', () => {
    const cf = getCashFlow(s);
    expect(cf.totalLiquidPence).toBe(cf.endingCashPence + cf.endingMomoPence);
  });

  it('purchases paid + outstanding = total purchases', () => {
    expect(s.totals.purchasesPaidPence + s.totals.purchasesOutstandingPence)
      .toBe(s.totals.totalPurchasesPence);
  });
});

describe('Demo fixture – sales data integrity', () => {
  it('generates more than 200 sales invoices', () => {
    expect(s.salesInvoices.length).toBeGreaterThan(200);
  });

  it('all invoice dates fall within the demo window', () => {
    for (const inv of s.salesInvoices) {
      expect(inv.date.getTime()).toBeGreaterThanOrEqual(s.period.start.getTime());
      expect(inv.date.getTime()).toBeLessThanOrEqual(s.period.end.getTime());
    }
  });

  it('no invoice has empty lines', () => {
    for (const inv of s.salesInvoices) {
      expect(inv.lines.length).toBeGreaterThan(0);
    }
  });

  it('credit invoices have a customerId', () => {
    for (const inv of s.salesInvoices) {
      if (inv.paymentMethod === 'CREDIT') {
        expect(inv.customerId).toBeTruthy();
      }
    }
  });

  it('all product IDs in sales lines exist in products', () => {
    const ids = new Set(s.products.map(p => p.id));
    for (const inv of s.salesInvoices) {
      for (const l of inv.lines) {
        expect(ids.has(l.productId)).toBe(true);
      }
    }
  });
});
