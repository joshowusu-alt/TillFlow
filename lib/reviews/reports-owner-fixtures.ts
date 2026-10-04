/** Synthetic review data only. No database imports, credentials or mutations. */
import { compareSalesMovement } from '@/lib/reports/business-movement/sales-comparison';
import { buildLeakageQualitySummary, buildMoneyMovementLayer } from '@/lib/reports/business-movement/money-leakage';
import { resolveLastFullCalendarMonthPair } from '@/lib/reports/business-movement/periods';
import { BUSINESS_MOVEMENT_DEFINITION_VERSION, type BusinessMovementWithMoneyResult, type MoneyPeriodFacts } from '@/lib/reports/business-movement/types';

export function ownerMovementFixture(large = false): BusinessMovementWithMoneyResult {
  const currentSales = large ? 1_234_567_890 : 16_273_050;
  const comparisonSales = large ? 876_543_210 : 15_925_350;
  const sales = compareSalesMovement({
    scope: { businessId: 'sample-only', branchIds: ['sample-branch'], currency: 'GHS', asOf: new Date('2026-10-04T12:00:00Z'), definitionVersion: BUSINESS_MOVEMENT_DEFINITION_VERSION,
      periods: resolveLastFullCalendarMonthPair({ timeZone: 'Africa/Accra', asOf: new Date('2026-10-04T12:00:00Z') }) },
    currentHeadline: { salesValuePence: currentSales, transactionCount: 1765, unitsSold: 2000 },
    comparisonHeadline: { salesValuePence: comparisonSales, transactionCount: 1792, unitsSold: 2100 },
    currentProducts: [{ id: 'rice', name: 'Sample rice 5kg', salesValuePence: large ? 308_641_973 : 905_000, qtyBase: large ? 20 : 61 }],
    comparisonProducts: [{ id: 'rice', name: 'Sample rice 5kg', salesValuePence: large ? 617_283_945 : 300_000, qtyBase: large ? 61 : 20 }],
    currentBranches: [{ id: 'sample-branch', name: 'Sample Main Branch', salesValuePence: currentSales, transactionCount: 1765 }],
    comparisonBranches: [{ id: 'sample-branch', name: 'Sample Main Branch', salesValuePence: comparisonSales, transactionCount: 1792 }],
    currentCashiers: [], comparisonCashiers: [], topN: 10,
  });
  const facts = (money: number, refund: number): MoneyPeriodFacts => ({
    moneyReceivedPence: money, refundOutflowsPence: refund, needsMomoConfirmationPence: 0,
    saleAmendMoneyOutPence: 0, moneyReceivedRecordCount: 10, refundRecordCount: 2,
    needsMomoRecordCount: 0, saleAmendRecordCount: 0,
  });
  const money = buildMoneyMovementLayer(facts(currentSales + 203_600, 245_600), facts(large ? comparisonSales : 14_470_450, 19_000), 'review-only');
  return { ...sales, money, leakage: buildLeakageQualitySummary({ salesHeadline: sales.headline, money }), moneyQueryFailed: false, moneyQueryError: null };
}
