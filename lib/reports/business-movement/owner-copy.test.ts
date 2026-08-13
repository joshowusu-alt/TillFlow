import { describe, expect, it } from 'vitest';

import {
  BUSINESS_MOVEMENT_DEFINITION_VERSION,
  buildLeakageQualitySummary,
  buildMoneyMovementLayer,
  buildOwnerInsightSummary,
  buildOwnerSummaryStrip,
  compareSalesMovement,
  formatHumanPeriodRange,
  ownerCategoryLabel,
  ownerConfidenceHint,
  ownerInsightCopy,
  ownerPeriodLabels,
  ownerProductMovers,
  ownerWhyItMatters,
  productMoverSideLabel,
  productQtyWording,
  rankBusinessMovementInsights,
  resolveLastFullCalendarMonthPair,
  rewriteOwnerPeriodCopy,
  shortPeriodLabel,
  singleBranchNote,
  singleCashierNote,
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

function buildResult(input?: {
  branches?: { id: string; name: string; current: number; comparison: number }[];
  cashiers?: { id: string; name: string; current: number; comparison: number }[];
  currentSales?: number;
  comparisonSales?: number;
  currentMoney?: Partial<MoneyPeriodFacts>;
  comparisonMoney?: Partial<MoneyPeriodFacts>;
}): BusinessMovementWithMoneyResult {
  const bmScope = scope();
  const branches = input?.branches ?? [
    { id: 'b1', name: 'Main Branch', current: 100_000, comparison: 80_000 },
  ];
  const cashiers = input?.cashiers ?? [
    { id: 'c1', name: 'Ama', current: 60_000, comparison: 50_000 },
  ];
  const sales = compareSalesMovement({
    scope: bmScope,
    currentHeadline: {
      salesValuePence: input?.currentSales ?? 78_455_0,
      transactionCount: 10,
      unitsSold: 100,
    },
    comparisonHeadline: {
      salesValuePence: input?.comparisonSales ?? 100_000_0,
      transactionCount: 8,
      unitsSold: 80,
    },
    currentProducts: [
      { id: 'p1', name: 'Frytol 1L', salesValuePence: 20_000, qtyBase: 39 },
      { id: 'p2', name: 'Star Milk', salesValuePence: 0, qtyBase: 0 },
      { id: 'p3', name: 'New SKU', salesValuePence: 12_000, qtyBase: 6 },
    ],
    comparisonProducts: [
      { id: 'p1', name: 'Frytol 1L', salesValuePence: 10_000, qtyBase: 10 },
      { id: 'p2', name: 'Star Milk', salesValuePence: 25_000, qtyBase: 20 },
      { id: 'p3', name: 'New SKU', salesValuePence: 0, qtyBase: 0 },
    ],
    currentBranches: branches.map((b) => ({
      id: b.id,
      name: b.name,
      salesValuePence: b.current,
      transactionCount: 1,
    })),
    comparisonBranches: branches.map((b) => ({
      id: b.id,
      name: b.name,
      salesValuePence: b.comparison,
      transactionCount: 1,
    })),
    currentCashiers: cashiers.map((c) => ({
      id: c.id,
      name: c.name,
      salesValuePence: c.current,
      transactionCount: 1,
    })),
    comparisonCashiers: cashiers.map((c) => ({
      id: c.id,
      name: c.name,
      salesValuePence: c.comparison,
      transactionCount: 1,
    })),
    topN: 10,
  });

  const currentMoney = moneyFacts({
    moneyReceivedPence: 70_000,
    refundOutflowsPence: 5_000,
    needsMomoConfirmationPence: 387_050,
    ...input?.currentMoney,
  });
  const comparisonMoney = moneyFacts({
    moneyReceivedPence: 75_000,
    refundOutflowsPence: 1_000,
    needsMomoConfirmationPence: 0,
    ...input?.comparisonMoney,
  });
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

describe('Business Movement 6H — owner copy', () => {
  it('maps internal categories to owner labels', () => {
    expect(ownerCategoryLabel('momo_confirmation_risk')).toBe('MoMo to confirm');
    expect(ownerCategoryLabel('product_growth')).toBe('Product grew');
    expect(ownerCategoryLabel('product_decline')).toBe('Product dropped');
    expect(ownerConfidenceHint('high')).toBe('Strong signal');
    expect(ownerConfidenceHint('medium')).toBeNull();
  });

  it('hides contribution percentages over 100%', () => {
    expect(
      ownerWhyItMatters('This SKU accounted for -123% of product-level sales change.'),
    ).toBe('This was among the largest product movements.');
    expect(
      ownerWhyItMatters('This branch contributed 140% of branch-level sales change.'),
    ).toBe('This was among the largest branch movements.');
    expect(
      ownerWhyItMatters('This SKU accounted for 42% of product-level sales change.'),
    ).toBe('This product was a large part of the sales change.');
    expect(ownerWhyItMatters('Headline sales moved down vs the comparison period.')).toBe(
      'Headline sales moved down vs the comparison period.',
    );
  });

  it('wording for product movers and qty', () => {
    expect(
      productMoverSideLabel({
        kind: 'new',
        salesValuePence: {
          current: 12000,
          comparison: 0,
          absoluteChange: 12000,
          percentageChange: null,
          percentageChangeStatus: 'undefined_zero_comparison',
        },
      }),
    ).toBe('New product');
    expect(
      productMoverSideLabel({
        kind: 'no_current_sales',
        salesValuePence: {
          current: 0,
          comparison: 25000,
          absoluteChange: -25000,
          percentageChange: null,
          percentageChangeStatus: 'ok',
        },
      }),
    ).toBe('No current sales');
    expect(
      productMoverSideLabel({
        kind: 'continuing',
        salesValuePence: {
          current: 20000,
          comparison: 10000,
          absoluteChange: 10000,
          percentageChange: 100,
          percentageChangeStatus: 'ok',
        },
      }),
    ).toBe('Grew');
    expect(
      productMoverSideLabel({
        kind: 'continuing',
        salesValuePence: {
          current: 5000,
          comparison: 25000,
          absoluteChange: -20000,
          percentageChange: -80,
          percentageChangeStatus: 'ok',
        },
      }),
    ).toBe('Dropped');
    expect(productQtyWording(39, 0, 'June')).toBe('39 sold vs 0 in June');
    expect(productQtyWording(85, 21, 'Apr-May')).toBe('85 sold vs 21 in Apr-May');
  });

  it('collapses single branch and single cashier', () => {
    const result = buildResult();
    expect(singleBranchNote(result.branches)).toBe('All movement is from Main Branch.');
    expect(singleCashierNote(result.cashiers)).toBe(
      'Sales in this view are attributed to Ama.',
    );

    const multi = buildResult({
      branches: [
        { id: 'b1', name: 'Main', current: 50_000, comparison: 40_000 },
        { id: 'b2', name: 'Annex', current: 30_000, comparison: 20_000 },
      ],
      cashiers: [
        { id: 'c1', name: 'Ama', current: 40_000, comparison: 30_000 },
        { id: 'c2', name: 'Kofi', current: 20_000, comparison: 15_000 },
      ],
    });
    expect(singleBranchNote(multi.branches)).toBeNull();
    expect(singleCashierNote(multi.cashiers)).toBeNull();
  });

  it('builds a plain-English summary strip with sales, money, and MoMo check', () => {
    const result = buildResult();
    expect(shortPeriodLabel(result.scope.periods.currentFromKey, result.scope.periods.currentToKey)).toBe(
      'July',
    );
    expect(
      shortPeriodLabel(result.scope.periods.comparisonFromKey, result.scope.periods.comparisonToKey),
    ).toBe('June');

    const summary = buildOwnerInsightSummary(result);
    const strip = buildOwnerSummaryStrip(result, summary.insights);
    expect(strip.sales).toContain('July sales were down');
    expect(strip.sales).toContain('compared with June');
    expect(strip.sales).not.toMatch(/last period/i);
    expect(strip.sales).not.toMatch(/2026-06-01|2026-07-01/);
    expect(strip.moneyReceived.toLowerCase()).toContain('money received');
    expect(strip.biggestCheck).toMatch(/confirm pending MoMo/i);
    expect(strip.paragraph).not.toMatch(/product_decline|momo_confirmation_risk|confidence high/i);
    expect(strip.paragraph).not.toMatch(/-123%/);
  });

  it('does not change ranking or Money Received values', () => {
    const result = buildResult();
    const ranked = rankBusinessMovementInsights(result);
    const summary = buildOwnerInsightSummary(result);
    buildOwnerSummaryStrip(result, summary.insights);
    ownerProductMovers(result);

    expect(result.money.moneyReceived.current).toBe(70_000);
    expect(result.money.needsMomoConfirmation.current).toBe(387_050);
    expect(ranked.find((i) => i.category === 'momo_confirmation_risk')).toBeTruthy();
    expect(ranked.find((i) => i.category === 'product_decline')?.rankScore).toBeGreaterThan(0);
    expect(summary.insights.length).toBeGreaterThanOrEqual(3);
    expect(summary.insights.length).toBeLessThanOrEqual(6);
  });
});

describe('Business Movement 6J — period label clarity', () => {
  it('formats a full calendar month', () => {
    expect(formatHumanPeriodRange('2026-07-01', '2026-07-31', 'full')).toBe('July 2026');
    expect(formatHumanPeriodRange('2026-06-01', '2026-06-30', 'full')).toBe('June 2026');
    expect(formatHumanPeriodRange('2026-07-01', '2026-07-31', 'short')).toBe('July');
    expect(formatHumanPeriodRange('2026-06-01', '2026-06-30', 'short')).toBe('June');
  });

  it('formats a multi-month aligned range', () => {
    expect(formatHumanPeriodRange('2026-06-01', '2026-07-31', 'full')).toBe('Jun-Jul 2026');
    expect(formatHumanPeriodRange('2026-04-01', '2026-05-31', 'full')).toBe('Apr-May 2026');
    expect(formatHumanPeriodRange('2026-06-01', '2026-07-31', 'short')).toBe('Jun-Jul');
    expect(formatHumanPeriodRange('2026-04-01', '2026-05-31', 'short')).toBe('Apr-May');
    expect(formatHumanPeriodRange('2025-12-01', '2026-01-31', 'full')).toBe('Dec 2025-Jan 2026');
  });

  it('formats a non-month-aligned custom range', () => {
    expect(formatHumanPeriodRange('2026-06-01', '2026-07-17', 'full')).toBe('1 Jun-17 Jul 2026');
    expect(formatHumanPeriodRange('2026-06-01', '2026-07-17', 'short')).toBe('1 Jun-17 Jul');
    expect(formatHumanPeriodRange('2025-12-15', '2026-01-10', 'full')).toBe(
      '15 Dec 2025-10 Jan 2026',
    );
  });

  it('builds the comparing line and rewrites vague insight copy', () => {
    const result = buildResult();
    const labels = ownerPeriodLabels(result.scope.periods);
    expect(labels.comparingLine).toBe('Comparing: July 2026 vs June 2026');
    expect(labels.currentRangeKeys).toBe('2026-07-01 → 2026-07-31');
    expect(labels.comparisonRangeKeys).toBe('2026-06-01 → 2026-06-30');

    expect(
      rewriteOwnerPeriodCopy('Headline sales moved down vs the comparison period.', labels),
    ).toBe('Headline sales moved down compared with June 2026.');
    expect(rewriteOwnerPeriodCopy('85 sold vs 21 last period', labels)).toBe(
      '85 sold vs 21 in June 2026',
    );

    const summary = buildOwnerInsightSummary(result);
    for (const insight of summary.insights) {
      const copy = ownerInsightCopy(insight, labels);
      const blob = `${copy.fact} ${copy.evidence} ${copy.signal} ${copy.recommendedCheck}`;
      expect(blob).not.toMatch(/last period/i);
      expect(blob).not.toMatch(/comparison period/i);
    }

    const frytol = ownerProductMovers(result).find((m) => m.productName === 'Frytol 1L');
    expect(frytol?.qtyWording).toBe('39 sold vs 10 in June');
  });

  it('does not change calculations when period labels are applied', () => {
    const result = buildResult();
    const rankedBefore = rankBusinessMovementInsights(result).map((i) => ({
      id: i.id,
      rankScore: i.rankScore,
      category: i.category,
    }));
    const labels = ownerPeriodLabels(result.scope.periods);
    const summary = buildOwnerInsightSummary(result);
    buildOwnerSummaryStrip(result, summary.insights);
    ownerProductMovers(result);
    for (const insight of summary.insights) {
      ownerInsightCopy(insight, labels);
    }
    const rankedAfter = rankBusinessMovementInsights(result).map((i) => ({
      id: i.id,
      rankScore: i.rankScore,
      category: i.category,
    }));
    expect(rankedAfter).toEqual(rankedBefore);
    expect(result.headline.salesValuePence.current).toBe(78_455_0);
    expect(result.headline.salesValuePence.comparison).toBe(100_000_0);
    expect(result.money.moneyReceived.current).toBe(70_000);
    expect(result.money.moneyReceived.comparison).toBe(75_000);
  });
});
