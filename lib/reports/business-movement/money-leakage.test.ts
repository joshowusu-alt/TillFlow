import { describe, expect, it } from 'vitest';

import {
  MONEY_RECEIVED_DEFINITION_VERSION,
  computeMoneyReceivedMetrics,
  isUnverifiedLegacyStatus,
  resolveMoneyReceivedScope,
  type MoneyMovementFacts,
  type ReportingScopeContext,
} from '@/lib/reports/money-received';
import {
  BUSINESS_MOVEMENT_DEFINITION_VERSION,
  BUSINESS_MOVEMENT_MONEY_LANGUAGE,
  buildChangePair,
  buildLeakageQualitySummary,
  buildMoneyMovementLayer,
  buildSalesHeadline,
  composeBusinessMovementWithMoney,
  composeBusinessMovementWithMoneyFromFacts,
  compareSalesMovement,
  moneyPeriodFactsFromMovementFacts,
  resolveLastFullCalendarMonthPair,
  saleAmendMoneyOutFromFacts,
  type BusinessMovementScope,
  type SalesComparisonResult,
} from '@/lib/reports/business-movement';

function mrScope(overrides: Partial<ReportingScopeContext> = {}): ReportingScopeContext {
  return resolveMoneyReceivedScope({
    businessId: 'biz-1',
    currency: 'GHS',
    timeZone: 'Africa/Accra',
    periodStart: new Date('2026-07-01T00:00:00.000Z'),
    periodEndInclusive: new Date('2026-08-01T00:00:00.000Z'),
    absoluteBounds: true,
    branchIds: null,
    asOf: new Date('2026-08-12T12:00:00.000Z'),
    ...overrides,
  });
}

function emptySales(scope: BusinessMovementScope): SalesComparisonResult {
  return compareSalesMovement({
    scope,
    currentHeadline: { salesValuePence: 50_000, transactionCount: 5, unitsSold: 10 },
    comparisonHeadline: { salesValuePence: 40_000, transactionCount: 4, unitsSold: 8 },
    currentProducts: [],
    comparisonProducts: [],
    currentBranches: [],
    comparisonBranches: [],
    currentCashiers: [],
    comparisonCashiers: [],
  });
}

describe('Business Movement 6C — Money Received parity', () => {
  it('money layer totals match canonical computeMoneyReceivedMetrics', () => {
    const scope = mrScope();
    const facts: MoneyMovementFacts = {
      receipts: [
        {
          id: 'p1',
          amountPence: 10_000,
          method: 'CASH',
          status: 'CONFIRMED',
          receivedAt: new Date('2026-07-10T12:00:00.000Z'),
          salesInvoiceId: 'inv1',
          branchId: 's1',
        },
        {
          id: 'p2',
          amountPence: -1_500,
          method: 'CASH',
          status: 'CONFIRMED',
          receivedAt: new Date('2026-07-11T12:00:00.000Z'),
          salesInvoiceId: 'inv1',
          branchId: 's1',
        },
        {
          id: 'p3',
          amountPence: 3_000,
          method: 'MOBILE_MONEY',
          status: 'PENDING_MANUAL',
          receivedAt: new Date('2026-07-12T12:00:00.000Z'),
          salesInvoiceId: 'inv2',
          branchId: 's1',
        },
      ],
      refunds: [
        {
          id: 'r1',
          amountPence: 2_000,
          refundEffectiveAt: new Date('2026-07-15T12:00:00.000Z'),
          salesInvoiceId: 'inv3',
          branchId: 's1',
        },
      ],
    };

    const canonical = computeMoneyReceivedMetrics(facts, scope);
    const byId = Object.fromEntries(canonical.map((m) => [m.metricId, m]));
    const derived = moneyPeriodFactsFromMovementFacts(facts, scope);

    expect(derived.moneyReceivedPence).toBe(byId.money_received?.valuePence);
    expect(derived.moneyReceivedPence).toBe(10_000 - 1_500); // amend nets inside MR
    expect(derived.refundOutflowsPence).toBe(byId.refund_outflows?.valuePence);
    expect(derived.refundOutflowsPence).toBe(2_000);
    expect(derived.needsMomoConfirmationPence).toBe(byId.unverified_legacy_receipts?.valuePence);
    expect(derived.needsMomoConfirmationPence).toBe(3_000);
    expect(derived.saleAmendMoneyOutPence).toBe(1_500);
    expect(saleAmendMoneyOutFromFacts(facts, scope).saleAmendRecordCount).toBe(1);
  });

  it('PENDING_MANUAL is unverified and excluded from money_received', () => {
    expect(isUnverifiedLegacyStatus('PENDING_MANUAL')).toBe(true);
    const scope = mrScope();
    const facts: MoneyMovementFacts = {
      receipts: [
        {
          id: 'pending',
          amountPence: 9_999,
          method: 'MOBILE_MONEY',
          status: 'PENDING_MANUAL',
          receivedAt: new Date('2026-07-20T12:00:00.000Z'),
          salesInvoiceId: 'inv',
          branchId: 's1',
        },
      ],
      refunds: [],
    };
    const derived = moneyPeriodFactsFromMovementFacts(facts, scope);
    expect(derived.moneyReceivedPence).toBe(0);
    expect(derived.needsMomoConfirmationPence).toBe(9_999);
  });

  it('refunds remain separate from Money Received headline', () => {
    const scope = mrScope();
    const facts: MoneyMovementFacts = {
      receipts: [
        {
          id: 'c',
          amountPence: 5_000,
          method: 'CASH',
          status: 'CONFIRMED',
          receivedAt: new Date('2026-07-05T12:00:00.000Z'),
          salesInvoiceId: 'inv',
          branchId: 's1',
        },
      ],
      refunds: [
        {
          id: 'rf',
          amountPence: 5_000,
          refundEffectiveAt: new Date('2026-07-06T12:00:00.000Z'),
          salesInvoiceId: 'inv',
          branchId: 's1',
        },
      ],
    };
    const derived = moneyPeriodFactsFromMovementFacts(facts, scope);
    expect(derived.moneyReceivedPence).toBe(5_000);
    expect(derived.refundOutflowsPence).toBe(5_000);
  });
});

describe('Business Movement 6C — period movement + leakage', () => {
  it('compares current vs comparison money periods and builds leakage gaps', () => {
    const periods = resolveLastFullCalendarMonthPair({
      timeZone: 'Africa/Accra',
      asOf: new Date('2026-08-12T12:00:00.000Z'),
    });
    const bmScope: BusinessMovementScope = {
      businessId: 'biz-1',
      branchIds: null,
      currency: 'GHS',
      periods,
      asOf: new Date('2026-08-12T12:00:00.000Z'),
      definitionVersion: BUSINESS_MOVEMENT_DEFINITION_VERSION,
    };

    const currentMr = resolveMoneyReceivedScope({
      businessId: 'biz-1',
      currency: 'GHS',
      timeZone: periods.timeZone,
      periodStart: periods.currentStart,
      periodEndInclusive: periods.currentEndExclusive,
      absoluteBounds: true,
      asOf: bmScope.asOf,
    });
    const comparisonMr = resolveMoneyReceivedScope({
      businessId: 'biz-1',
      currency: 'GHS',
      timeZone: periods.timeZone,
      periodStart: periods.comparisonStart,
      periodEndInclusive: periods.comparisonEndExclusive,
      absoluteBounds: true,
      asOf: bmScope.asOf,
    });

    const currentFacts: MoneyMovementFacts = {
      receipts: [
        {
          id: 'cur',
          amountPence: 20_000,
          method: 'CASH',
          status: 'CONFIRMED',
          receivedAt: new Date(periods.currentStart.getTime() + 86_400_000),
          salesInvoiceId: 'i1',
          branchId: 's1',
        },
        {
          id: 'cur-amend',
          amountPence: -2_000,
          method: 'CASH',
          status: 'CONFIRMED',
          receivedAt: new Date(periods.currentStart.getTime() + 2 * 86_400_000),
          salesInvoiceId: 'i1',
          branchId: 's1',
        },
        {
          id: 'cur-pending',
          amountPence: 4_000,
          method: 'MOBILE_MONEY',
          status: 'PENDING_MANUAL',
          receivedAt: new Date(periods.currentStart.getTime() + 3 * 86_400_000),
          salesInvoiceId: 'i2',
          branchId: 's1',
        },
      ],
      refunds: [
        {
          id: 'cur-rf',
          amountPence: 1_000,
          refundEffectiveAt: new Date(periods.currentStart.getTime() + 4 * 86_400_000),
          salesInvoiceId: 'i3',
          branchId: 's1',
        },
      ],
    };
    const comparisonFacts: MoneyMovementFacts = {
      receipts: [
        {
          id: 'prev',
          amountPence: 10_000,
          method: 'CASH',
          status: 'CONFIRMED',
          receivedAt: new Date(periods.comparisonStart.getTime() + 86_400_000),
          salesInvoiceId: 'i0',
          branchId: 's1',
        },
      ],
      refunds: [],
    };

    const sales = emptySales(bmScope);
    const result = composeBusinessMovementWithMoneyFromFacts({
      sales,
      currentFacts,
      comparisonFacts,
      currentMrScope: currentMr,
      comparisonMrScope: comparisonMr,
    });

    expect(result.money.moneyReceived.current).toBe(18_000);
    expect(result.money.moneyReceived.comparison).toBe(10_000);
    expect(result.money.moneyReceived.absoluteChange).toBe(8_000);
    expect(result.money.saleAmendMoneyOut.current).toBe(2_000);
    expect(result.money.needsMomoConfirmation.current).toBe(4_000);
    expect(result.money.refundOutflows.current).toBe(1_000);
    expect(result.money.moneyReceivedDefinitionVersion).toBe(MONEY_RECEIVED_DEFINITION_VERSION);

    expect(result.leakage.salesMinusMoneyReceivedCurrentPence).toBe(50_000 - 18_000);
    expect(result.leakage.languageNotes).toContain(BUSINESS_MOVEMENT_MONEY_LANGUAGE.salesVsMoney);
    expect(result.leakage.languageNotes).toContain(BUSINESS_MOVEMENT_MONEY_LANGUAGE.pendingMomo);
    expect(result.stockInsightsEmitted).toBe(false);
  });

  it('zero comparison guards on money change pairs', () => {
    const money = buildMoneyMovementLayer(
      {
        moneyReceivedPence: 100,
        refundOutflowsPence: 0,
        saleAmendMoneyOutPence: 0,
        needsMomoConfirmationPence: 50,
        moneyReceivedRecordCount: 1,
        refundRecordCount: 0,
        saleAmendRecordCount: 0,
        needsMomoRecordCount: 1,
      },
      {
        moneyReceivedPence: 0,
        refundOutflowsPence: 0,
        saleAmendMoneyOutPence: 0,
        needsMomoConfirmationPence: 0,
        moneyReceivedRecordCount: 0,
        refundRecordCount: 0,
        saleAmendRecordCount: 0,
        needsMomoRecordCount: 0,
      },
      MONEY_RECEIVED_DEFINITION_VERSION,
    );
    expect(money.moneyReceived.percentageChange).toBeNull();
    expect(money.moneyReceived.percentageChangeStatus).toBe('undefined_zero_comparison');
    expect(money.needsMomoConfirmation.absoluteChange).toBe(50);

    const headline = buildSalesHeadline(
      { salesValuePence: 200, transactionCount: 2, unitsSold: 2 },
      { salesValuePence: 0, transactionCount: 0, unitsSold: 0 },
    );
    const leakage = buildLeakageQualitySummary({ salesHeadline: headline, money });
    expect(leakage.salesVsMoneyReceivedGapChangePence).toBe(200 - 100);
  });

  it('composeBusinessMovementWithMoney attaches change pairs without forking sales', () => {
    const periods = resolveLastFullCalendarMonthPair({
      timeZone: 'Africa/Accra',
      asOf: new Date('2026-08-12T12:00:00.000Z'),
    });
    const scope: BusinessMovementScope = {
      businessId: 'biz-1',
      branchIds: null,
      currency: 'GHS',
      periods,
      asOf: new Date('2026-08-12T12:00:00.000Z'),
      definitionVersion: BUSINESS_MOVEMENT_DEFINITION_VERSION,
    };
    const sales = emptySales(scope);
    const composed = composeBusinessMovementWithMoney({
      sales,
      currentMoney: {
        moneyReceivedPence: 1,
        refundOutflowsPence: 0,
        saleAmendMoneyOutPence: 0,
        needsMomoConfirmationPence: 0,
        moneyReceivedRecordCount: 1,
        refundRecordCount: 0,
        saleAmendRecordCount: 0,
        needsMomoRecordCount: 0,
      },
      comparisonMoney: {
        moneyReceivedPence: 1,
        refundOutflowsPence: 0,
        saleAmendMoneyOutPence: 0,
        needsMomoConfirmationPence: 0,
        moneyReceivedRecordCount: 1,
        refundRecordCount: 0,
        saleAmendRecordCount: 0,
        needsMomoRecordCount: 0,
      },
    });
    expect(composed.headline.salesValuePence.current).toBe(sales.headline.salesValuePence.current);
    expect(composed.money.moneyReceived.absoluteChange).toBe(0);
    expect(buildChangePair(1, 1).percentageChange).toBe(0);
  });
});
