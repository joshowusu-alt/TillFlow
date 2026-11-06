import { describe, expect, it } from 'vitest';
import { buildDemoLedger } from './build-demo-ledger';
import { getCashFlow, getDashboardKPIs, getDebtorBalances, getIncomeStatement, getSalesByDay, getPaymentSplit } from './reports';
import { DEMO_PERIOD_DAYS } from '@/lib/demo-sandbox/constants';

describe('fictional demo ledger reconciliation (no database)', () => {
  const s = buildDemoLedger();
  const t = s.totals;
  it('reconciles every invoice, payment method and reporting day to revenue', () => {
    for (const i of s.salesInvoices) {
      expect(i.subtotalPence).toBe(i.lines.reduce((sum, l) => sum + l.qty * l.unitPricePence, 0));
      expect(i.date >= s.period.start && i.date <= s.period.end).toBe(true);
    }
    expect(t.cashSalesPence + t.momoSalesPence + t.cardSalesPence + t.creditSalesPence).toBe(t.totalRevenuePence);
    expect(getSalesByDay(s).reduce((sum, d) => sum + d.revenuePence, 0)).toBe(t.totalRevenuePence);
    expect(Math.round((s.period.end.getTime() - s.period.start.getTime() + 1) / 86400000)).toBe(DEMO_PERIOD_DAYS);
    expect(getSalesByDay(s)).toHaveLength(DEMO_PERIOD_DAYS);
    expect(getDashboardKPIs(s).avgDailySalesPence).toBe(Math.round(t.totalRevenuePence / DEMO_PERIOD_DAYS));
  });
  it('keeps MoMo, card and collection channels separate across views', () => {
    const cash = getCashFlow(s);
    expect(getDashboardKPIs(s).momoPositionPence).toBe(cash.endingMomoPence);
    expect(cash.endingMomoPence).toBe(getPaymentSplit(s).momoPence + t.momoCollectedPence);
    expect(t.cashCollectedPence + t.momoCollectedPence).toBe(t.creditCollectedPence);
    expect(cash.endingCashPence).toBe(t.openingCashPence + t.cashSalesPence + t.cashCollectedPence - t.purchasesPaidPence - t.totalExpensesPence);
    expect(cash.totalLiquidPence).toBe(t.openingCashPence + t.cashSalesPence + t.momoSalesPence + t.cardSalesPence + t.creditCollectedPence - t.purchasesPaidPence - t.totalExpensesPence);
  });
  it('does not offset customer overpayments against another debtor', () => {
    const rows = getDebtorBalances(s);
    expect(t.arBalancePence).toBe(rows.reduce((sum, r) => sum + Math.max(0, r.balancePence), 0));
    expect(t.customerCreditPence).toBe(rows.reduce((sum, r) => sum + Math.max(0, -r.balancePence), 0));
    expect(t.arBalancePence - t.customerCreditPence).toBe(t.creditSalesPence - t.creditCollectedPence);
  });
  it('reconciles costs, gross profit, expenses, net profit and margin', () => {
    expect(t.totalCOGSPence).toBe(s.salesInvoices.reduce((sum, i) => sum + i.lines.reduce((n, l) => n + l.qty * l.costPricePence, 0), 0));
    expect(t.grossProfitPence).toBe(t.totalRevenuePence - t.totalCOGSPence);
    expect(t.netProfitPence).toBe(t.grossProfitPence - s.expenses.reduce((sum, e) => sum + e.amountPence, 0));
    expect(getIncomeStatement(s).grossProfitPence).toBe(getDashboardKPIs(s).periodGrossProfitPence);
    expect(t.grossMarginBps).toBe(Math.round(t.grossProfitPence / t.totalRevenuePence * 10000));
  });
  it('reconciles stock and supplier balances', () => {
    for (const b of s.inventoryBalances.values()) expect(b.endingQty).toBe(b.openingQty + b.purchasedQty - b.soldQty);
    expect(t.apBalancePence).toBe(s.purchaseInvoices.reduce((sum, p) => sum + p.totalPence - p.paidPence, 0));
    expect(t.endingInventoryValuePence).toBe(t.openingInventoryValuePence + t.totalPurchasesPence - t.totalCOGSPence);
  });
});
