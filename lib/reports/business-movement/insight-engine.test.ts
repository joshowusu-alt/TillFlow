import { describe, expect, it } from 'vitest';

import {
  BUSINESS_MOVEMENT_DEFINITION_VERSION,
  BUSINESS_MOVEMENT_MONEY_LANGUAGE,
  STOCK_AVAILABILITY_READINESS,
  assertOwnerSummaryHasNoStockCause,
  buildChangePair,
  buildLeakageQualitySummary,
  buildMoneyMovementLayer,
  buildOwnerInsightSummary,
  compareSalesMovement,
  containsForbiddenStockLanguage,
  describeChangeVsComparison,
  insightTextBlob,
  rankBusinessMovementInsights,
  resolveLastFullCalendarMonthPair,
  type BusinessMovementScope,
  type BusinessMovementWithMoneyResult,
  type MoneyPeriodFacts,
} from '@/lib/reports/business-movement';
import { MONEY_RECEIVED_DEFINITION_VERSION } from '@/lib/reports/money-received';

function scope(): BusinessMovementScope {
  const periods = resolveLastFullCalendarMonthPair({
    timeZone: 'Africa/Accra',
    asOf: new Date('2026-08-12T12:00:00.000Z'),
  });
  return {
    businessId: 'biz-1',
    branchIds: null,
    currency: 'GHS',
    periods,
    asOf: new Date('2026-08-12T12:00:00.000Z'),
    definitionVersion: BUSINESS_MOVEMENT_DEFINITION_VERSION,
  };
}

function moneyFacts(partial?: Partial<MoneyPeriodFacts>): MoneyPeriodFacts {
  return {
    moneyReceivedPence: 0,
    refundOutflowsPence: 0,
    saleAmendMoneyOutPence: 0,
    needsMomoConfirmationPence: 0,
    moneyReceivedRecordCount: 0,
    refundRecordCount: 0,
    saleAmendRecordCount: 0,
    needsMomoRecordCount: 0,
    ...partial,
  };
}

function buildResult(input: {
  currentSales?: number;
  comparisonSales?: number;
  products?: {
    id: string;
    name: string;
    current: number;
    comparison: number;
    qtyCurrent?: number;
    qtyComparison?: number;
  }[];
  branches?: { id: string; name: string; current: number; comparison: number }[];
  cashiers?: { id: string; name: string; current: number; comparison: number }[];
  currentMoney?: Partial<MoneyPeriodFacts>;
  comparisonMoney?: Partial<MoneyPeriodFacts>;
}): BusinessMovementWithMoneyResult {
  const bmScope = scope();
  const products = input.products ?? [];
  const sales = compareSalesMovement({
    scope: bmScope,
    currentHeadline: {
      salesValuePence: input.currentSales ?? 100_000,
      transactionCount: 10,
      unitsSold: 100,
    },
    comparisonHeadline: {
      salesValuePence: input.comparisonSales ?? 80_000,
      transactionCount: 8,
      unitsSold: 80,
    },
    currentProducts: products.map((p) => ({
      id: p.id,
      name: p.name,
      salesValuePence: p.current,
      qtyBase: p.qtyCurrent ?? 1,
    })),
    comparisonProducts: products.map((p) => ({
      id: p.id,
      name: p.name,
      salesValuePence: p.comparison,
      qtyBase: p.qtyComparison ?? 1,
    })),
    currentBranches: (input.branches ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      salesValuePence: b.current,
      transactionCount: 1,
    })),
    comparisonBranches: (input.branches ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      salesValuePence: b.comparison,
      transactionCount: 1,
    })),
    currentCashiers: (input.cashiers ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      salesValuePence: c.current,
      transactionCount: 1,
    })),
    comparisonCashiers: (input.cashiers ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      salesValuePence: c.comparison,
      transactionCount: 1,
    })),
    topN: 10,
  });

  const currentMoney = moneyFacts(input.currentMoney);
  const comparisonMoney = moneyFacts(input.comparisonMoney);
  const money = buildMoneyMovementLayer(
    currentMoney,
    comparisonMoney,
    MONEY_RECEIVED_DEFINITION_VERSION,
  );
  const leakage = buildLeakageQualitySummary({
    salesHeadline: sales.headline,
    money,
  });

  return {
    ...sales,
    money,
    leakage,
    moneyQueryFailed: false,
    moneyQueryError: null,
  };
}

describe('Business Movement 6D — insight ranking', () => {
  it('ranks the biggest product decline highly', () => {
    const result = buildResult({
      currentSales: 50_000,
      comparisonSales: 100_000,
      products: [
        { id: 'tiny', name: 'Tiny Drop', current: 9_000, comparison: 10_000 },
        { id: 'frytol', name: 'Frytol 1L', current: 10_000, comparison: 40_000 },
        { id: 'grow', name: 'Grower', current: 20_000, comparison: 5_000 },
      ],
    });

    const ranked = rankBusinessMovementInsights(result, {
      minAbsSalesDeltaPence: 100_00,
    });
    const declineIdx = ranked.findIndex((i) => i.id === 'product-decline-frytol');
    const tinyIdx = ranked.findIndex((i) => i.id.includes('tiny'));
    expect(declineIdx).toBeGreaterThanOrEqual(0);
    expect(ranked[declineIdx]?.category).toBe('product_decline');
    // Frytol |Δ|=30000 outranks Tiny |Δ|=1000 when both present
    if (tinyIdx >= 0) {
      expect(ranked[declineIdx]!.rankScore).toBeGreaterThan(ranked[tinyIdx]!.rankScore);
    }
    // Biggest product decline is the top product_decline insight
    const topProductDecline = ranked.find((i) => i.category === 'product_decline');
    expect(topProductDecline?.id).toBe('product-decline-frytol');
    expect(topProductDecline!.rankScore).toBeGreaterThanOrEqual(
      ranked.find((i) => i.category === 'product_growth')?.rankScore ?? 0,
    );
  });

  it('suppresses tiny/noisy changes', () => {
    const result = buildResult({
      currentSales: 10_050,
      comparisonSales: 10_000,
      products: [{ id: 'noise', name: 'Noise', current: 5050, comparison: 5000 }],
      currentMoney: { moneyReceivedPence: 10_000 },
      comparisonMoney: { moneyReceivedPence: 10_000 },
    });
    const ranked = rankBusinessMovementInsights(result, {
      minAbsSalesDeltaPence: 100_00,
      minAbsMoneyDeltaPence: 100_00,
      minAbsGapPence: 100_00,
    });
    expect(ranked.every((i) => !i.id.includes('noise'))).toBe(true);
    expect(ranked.some((i) => i.category === 'insufficient_data' || i.id === 'insufficient-or-flat')).toBe(
      true,
    );
  });

  it('handles zero comparison without fake percentage', () => {
    const described = describeChangeVsComparison(buildChangePair(5_000, 0), 'Needs MoMo confirmation');
    expect(described.usedPercentage).toBe(false);
    expect(described.factClause.toLowerCase()).toContain('no comparison base');
    expect(described.factClause).not.toMatch(/%/);

    const result = buildResult({
      products: [{ id: 'new1', name: 'New SKU', current: 12_000, comparison: 0 }],
      currentMoney: { needsMomoConfirmationPence: 8_000 },
      comparisonMoney: { needsMomoConfirmationPence: 0 },
    });
    const ranked = rankBusinessMovementInsights(result, { minAbsSalesDeltaPence: 100_00 });
    const neu = ranked.find((i) => i.id === 'product-new-new1');
    expect(neu?.fact.toLowerCase()).toContain('no comparison base');
    expect(neu?.fact).not.toMatch(/up by|down by.*%/i);
  });

  it('generates pending MoMo insight', () => {
    const result = buildResult({
      currentMoney: { moneyReceivedPence: 50_000, needsMomoConfirmationPence: 7_500 },
      comparisonMoney: { moneyReceivedPence: 50_000, needsMomoConfirmationPence: 1_000 },
    });
    const ranked = rankBusinessMovementInsights(result);
    const momo = ranked.find((i) => i.category === 'momo_confirmation_risk');
    expect(momo).toBeTruthy();
    expect(momo!.fact.toLowerCase()).toMatch(/momo|confirmation/);
    expect(momo!.recommendedCheck.toLowerCase()).toContain('momo confirmation');
    expect(momo!.evidence).toContain(BUSINESS_MOVEMENT_MONEY_LANGUAGE.pendingMomo);
  });

  it('generates refund increase insight', () => {
    const result = buildResult({
      currentMoney: { moneyReceivedPence: 40_000, refundOutflowsPence: 8_000 },
      comparisonMoney: { moneyReceivedPence: 40_000, refundOutflowsPence: 1_000 },
    });
    const ranked = rankBusinessMovementInsights(result);
    const refund = ranked.find((i) => i.category === 'refund_increase');
    expect(refund).toBeTruthy();
    expect(refund!.evidence).toContain(BUSINESS_MOVEMENT_MONEY_LANGUAGE.refunds);
  });

  it('sales vs money gap uses careful wording', () => {
    const result = buildResult({
      currentSales: 100_000,
      comparisonSales: 100_000,
      currentMoney: { moneyReceivedPence: 60_000 },
      comparisonMoney: { moneyReceivedPence: 60_000 },
    });
    const ranked = rankBusinessMovementInsights(result, { minAbsGapPence: 100_00 });
    const gap = ranked.find((i) => i.id === 'money-received-gap');
    expect(gap).toBeTruthy();
    expect(gap!.signal).toBe(BUSINESS_MOVEMENT_MONEY_LANGUAGE.gapIndicator);
    expect(gap!.recommendedCheck.toLowerCase()).toContain('not treat this gap as a balancing error');
    expect(gap!.evidence.toLowerCase()).toMatch(/createdat|receivedat/);
  });

  it('omits stock causation language when readiness is NOT_RELIABLE', () => {
    expect(STOCK_AVAILABILITY_READINESS).toBe('NOT_RELIABLE');
    const result = buildResult({
      currentSales: 40_000,
      comparisonSales: 90_000,
      products: [{ id: 'p1', name: 'Star Milk', current: 5_000, comparison: 35_000 }],
      currentMoney: { moneyReceivedPence: 40_000, needsMomoConfirmationPence: 2_000 },
      comparisonMoney: { moneyReceivedPence: 80_000, needsMomoConfirmationPence: 500 },
    });
    const summary = buildOwnerInsightSummary(result);
    assertOwnerSummaryHasNoStockCause(summary);
    expect(summary.stockCauseLanguagePresent).toBe(false);
    expect(containsForbiddenStockLanguage(insightTextBlob(summary))).toBe(false);
    expect(insightTextBlob(summary)).not.toContain('review availability');
  });

  it('caps owner summary at 3–6 insights', () => {
    const products = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      name: `Product ${i}`,
      current: 1_000,
      comparison: 20_000 + i * 1_000,
    }));
    const result = buildResult({
      currentSales: 20_000,
      comparisonSales: 200_000,
      products,
      branches: [
        { id: 'b1', name: 'Main', current: 5_000, comparison: 80_000 },
        { id: 'b2', name: 'Annex', current: 5_000, comparison: 60_000 },
      ],
      cashiers: [
        { id: 'c1', name: 'Ama', current: 8_000, comparison: 50_000 },
        { id: 'c2', name: 'Kofi', current: 7_000, comparison: 40_000 },
      ],
      currentMoney: {
        moneyReceivedPence: 15_000,
        refundOutflowsPence: 9_000,
        saleAmendMoneyOutPence: 6_000,
        needsMomoConfirmationPence: 5_000,
      },
      comparisonMoney: {
        moneyReceivedPence: 150_000,
        refundOutflowsPence: 1_000,
        saleAmendMoneyOutPence: 500,
        needsMomoConfirmationPence: 200,
      },
    });

    const summary = buildOwnerInsightSummary(result);
    expect(summary.insights.length).toBeGreaterThanOrEqual(3);
    expect(summary.insights.length).toBeLessThanOrEqual(6);
    assertOwnerSummaryHasNoStockCause(summary);
  });
});
