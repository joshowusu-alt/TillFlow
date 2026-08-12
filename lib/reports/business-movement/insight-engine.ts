import { BUSINESS_MOVEMENT_MONEY_LANGUAGE } from './money-language';
import {
  containsForbiddenStockLanguage,
  describeChangeVsComparison,
  formatGhPence,
  formatSignedGhPence,
} from './insight-format';
import {
  FORBIDDEN_STOCK_CAUSE_PHRASES,
  resolveInsightThresholds,
} from './insight-thresholds';
import type {
  InsightCategory,
  InsightConfidence,
  InsightEngineOptions,
  InsightSeverity,
  OwnerInsightSummary,
  RankedBusinessMovementInsight,
} from './insight-types';
import {
  STOCK_AVAILABILITY_READINESS,
  type BusinessMovementWithMoneyResult,
  type ChangePair,
} from './types';

function meaningfulPct(pair: ChangePair, minPct: number): boolean {
  return (
    pair.percentageChangeStatus === 'ok' &&
    pair.percentageChange != null &&
    Math.abs(pair.percentageChange) >= minPct
  );
}

function scoreAbs(delta: number, weight = 1): number {
  return Math.abs(delta) * weight;
}

function assertNoStockCause(insight: RankedBusinessMovementInsight): void {
  const blob = `${insight.fact} ${insight.evidence} ${insight.signal} ${insight.recommendedCheck}`;
  if (STOCK_AVAILABILITY_READINESS === 'NOT_RELIABLE' && containsForbiddenStockLanguage(blob)) {
    throw new Error(`Stock-cause language leaked into insight ${insight.id}`);
  }
}

function pushInsight(
  list: RankedBusinessMovementInsight[],
  insight: RankedBusinessMovementInsight,
): void {
  assertNoStockCause(insight);
  list.push(insight);
}

function salesHeadlineInsights(
  result: BusinessMovementWithMoneyResult,
  thresholds: ReturnType<typeof resolveInsightThresholds>,
  out: RankedBusinessMovementInsight[],
): void {
  const pair = result.headline.salesValuePence;
  if (Math.abs(pair.absoluteChange) < thresholds.minAbsSalesDeltaPence) return;

  const described = describeChangeVsComparison(pair, 'Sales');
  const isDrop = pair.absoluteChange < 0;
  const category: InsightCategory = isDrop ? 'sales_drop' : 'sales_growth';
  const severity: InsightSeverity =
    Math.abs(pair.absoluteChange) >= thresholds.minAbsSalesDeltaPence * 3 ? 'attention' : 'watch';

  pushInsight(out, {
    id: `sales-${category}`,
    category,
    severity,
    confidence: 'high',
    fact: described.factClause,
    evidence: `Invoice sales (createdAt) current ${formatGhPence(pair.current)} vs comparison ${formatGhPence(pair.comparison)}; tx ${result.headline.transactionCount.current} vs ${result.headline.transactionCount.comparison}.`,
    signal: isDrop
      ? 'Headline sales moved down vs the comparison period.'
      : 'Headline sales moved up vs the comparison period.',
    recommendedCheck: isDrop
      ? 'Open product and branch decliners on Business Movement to see where the drop concentrated.'
      : 'Open product and branch growers on Business Movement to see what drove the increase.',
    supportingMetrics: {
      salesCurrentPence: pair.current,
      salesComparisonPence: pair.comparison,
      salesAbsoluteChangePence: pair.absoluteChange,
      salesPercentageChange: pair.percentageChange,
      usedPercentage: described.usedPercentage ? 1 : 0,
    },
    rankScore: scoreAbs(pair.absoluteChange, 1.2),
  });
}

function productInsights(
  result: BusinessMovementWithMoneyResult,
  thresholds: ReturnType<typeof resolveInsightThresholds>,
  out: RankedBusinessMovementInsight[],
): void {
  for (const row of result.productDecliners) {
    const pair = row.salesValuePence;
    if (row.kind === 'new') continue;
    if (Math.abs(pair.absoluteChange) < thresholds.minAbsSalesDeltaPence) continue;

    const described =
      pair.comparison === 0
        ? null
        : describeChangeVsComparison(pair, `${row.productName} sales`);

    if (row.kind === 'no_current_sales') {
      pushInsight(out, {
        id: `product-gone-${row.productId}`,
        category: 'product_decline',
        severity: 'watch',
        confidence: 'high',
        fact: `${row.productName} had ${formatGhPence(pair.comparison)} in the comparison period and no recorded sales in the current period`,
        evidence: `Product line sales Δ ${formatSignedGhPence(pair.absoluteChange)}; qty comparison ${row.qtyBase.comparison} → current ${row.qtyBase.current}.`,
        signal: 'This SKU disappeared from current-period sales (not labelled as a % drop).',
        recommendedCheck: `Check whether ${row.productName} was delisted, out of assortment, or simply not sold — then review purchases if you still stock it.`,
        supportingMetrics: {
          productId: row.productId,
          absoluteChangePence: pair.absoluteChange,
          comparisonPence: pair.comparison,
          currentPence: pair.current,
          contribution: row.contributionToSalesChange,
        },
        rankScore: scoreAbs(pair.absoluteChange, 1.1),
      });
      continue;
    }

    pushInsight(out, {
      id: `product-decline-${row.productId}`,
      category: 'product_decline',
      severity: 'attention',
      confidence: 'high',
      fact: described?.factClause ?? `${row.productName} sales fell by ${formatGhPence(Math.abs(pair.absoluteChange))}`,
      evidence: `Line sales current ${formatGhPence(pair.current)} vs comparison ${formatGhPence(pair.comparison)}; qty ${row.qtyBase.current} vs ${row.qtyBase.comparison}.`,
      signal:
        row.contributionToSalesChange != null
          ? `This SKU accounted for ${(row.contributionToSalesChange * 100).toFixed(0)}% of product-level sales change.`
          : 'This SKU is among the largest product sales declines.',
      recommendedCheck: `Review ${row.productName} sales on Trading / Analytics and check restock timing before treating this as lower demand.`,
      supportingMetrics: {
        productId: row.productId,
        absoluteChangePence: pair.absoluteChange,
        percentageChange: pair.percentageChange,
        contribution: row.contributionToSalesChange,
        usedPercentage: meaningfulPct(pair, thresholds.minPctForMention) ? 1 : 0,
      },
      rankScore: scoreAbs(pair.absoluteChange, 1.15),
    });
  }

  for (const row of result.productGrowers) {
    const pair = row.salesValuePence;
    if (Math.abs(pair.absoluteChange) < thresholds.minAbsSalesDeltaPence) continue;

    if (row.kind === 'new' || pair.comparison === 0) {
      pushInsight(out, {
        id: `product-new-${row.productId}`,
        category: 'product_growth',
        severity: 'info',
        confidence: 'high',
        fact: `${row.productName} is new this period at ${formatGhPence(pair.current)} (no comparison base)`,
        evidence: `No comparison-period line sales for this productId; current qty ${row.qtyBase.current}.`,
        signal: 'Treat as a new contributor — do not describe as a percentage increase.',
        recommendedCheck: `Confirm ${row.productName} was intentionally introduced and monitor whether growth continues next period.`,
        supportingMetrics: {
          productId: row.productId,
          currentPence: pair.current,
          absoluteChangePence: pair.absoluteChange,
        },
        rankScore: scoreAbs(pair.absoluteChange, 0.9),
      });
      continue;
    }

    const described = describeChangeVsComparison(pair, `${row.productName} sales`);
    pushInsight(out, {
      id: `product-growth-${row.productId}`,
      category: 'product_growth',
      severity: 'info',
      confidence: 'high',
      fact: described.factClause,
      evidence: `Line sales current ${formatGhPence(pair.current)} vs comparison ${formatGhPence(pair.comparison)}.`,
      signal:
        row.contributionToSalesChange != null
          ? `This SKU accounted for ${(row.contributionToSalesChange * 100).toFixed(0)}% of product-level sales change.`
          : 'This SKU is among the largest product sales increases.',
      recommendedCheck: `Keep ${row.productName} in stock and watch whether the growth holds next period.`,
      supportingMetrics: {
        productId: row.productId,
        absoluteChangePence: pair.absoluteChange,
        percentageChange: pair.percentageChange,
        contribution: row.contributionToSalesChange,
      },
      rankScore: scoreAbs(pair.absoluteChange, 0.95),
    });
  }

  // Explicit new / disappeared lists if not already captured via growers/decliners thresholds
  for (const row of result.newProducts) {
    if (out.some((i) => i.id === `product-new-${row.productId}`)) continue;
    if (row.salesValuePence.current < thresholds.minAbsSalesDeltaPence) continue;
    pushInsight(out, {
      id: `product-new-${row.productId}`,
      category: 'product_growth',
      severity: 'info',
      confidence: 'medium',
      fact: `${row.productName} is new this period at ${formatGhPence(row.salesValuePence.current)} (no comparison base)`,
      evidence: 'Marked kind=new from period merge (comparison sales = 0).',
      signal: 'New product contributor — percentage change is undefined.',
      recommendedCheck: `Confirm listing for ${row.productName} and monitor next period.`,
      supportingMetrics: { productId: row.productId, currentPence: row.salesValuePence.current },
      rankScore: scoreAbs(row.salesValuePence.current, 0.85),
    });
  }

  for (const row of result.noCurrentSalesProducts) {
    if (out.some((i) => i.id === `product-gone-${row.productId}`)) continue;
    if (row.salesValuePence.comparison < thresholds.minAbsSalesDeltaPence) continue;
    pushInsight(out, {
      id: `product-gone-${row.productId}`,
      category: 'product_decline',
      severity: 'watch',
      confidence: 'medium',
      fact: `${row.productName} had ${formatGhPence(row.salesValuePence.comparison)} last period and no current-period sales`,
      evidence: 'Marked kind=no_current_sales from period merge.',
      signal: 'Disappeared from current sales — not expressed as a fake percentage.',
      recommendedCheck: `Check assortment and demand for ${row.productName}.`,
      supportingMetrics: {
        productId: row.productId,
        comparisonPence: row.salesValuePence.comparison,
      },
      rankScore: scoreAbs(row.salesValuePence.comparison, 0.9),
    });
  }
}

function branchInsights(
  result: BusinessMovementWithMoneyResult,
  thresholds: ReturnType<typeof resolveInsightThresholds>,
  out: RankedBusinessMovementInsight[],
): void {
  const ranked = [...result.branches].sort(
    (a, b) => Math.abs(b.salesValuePence.absoluteChange) - Math.abs(a.salesValuePence.absoluteChange),
  );

  for (const row of ranked) {
    const pair = row.salesValuePence;
    if (Math.abs(pair.absoluteChange) < thresholds.minAbsSalesDeltaPence) continue;
    const isDrop = pair.absoluteChange < 0;
    const category: InsightCategory = isDrop ? 'branch_drop' : 'branch_growth';
    const described = describeChangeVsComparison(pair, `${row.storeName} sales`);

    pushInsight(out, {
      id: `branch-${category}-${row.storeId}`,
      category,
      severity: isDrop ? 'attention' : 'info',
      confidence: 'high',
      fact: described.factClause,
      evidence: `Branch invoice sales current ${formatGhPence(pair.current)} vs comparison ${formatGhPence(pair.comparison)}; tx ${row.transactionCount.current} vs ${row.transactionCount.comparison}.`,
      signal:
        row.contributionToSalesChange != null
          ? `This branch contributed ${(row.contributionToSalesChange * 100).toFixed(0)}% of branch-level sales change.`
          : 'Material branch movement vs comparison period.',
      recommendedCheck: isDrop
        ? `Open Business Movement filtered to ${row.storeName} and review its product decliners.`
        : `Note ${row.storeName} growth and confirm staffing/stock can sustain it.`,
      supportingMetrics: {
        storeId: row.storeId,
        absoluteChangePence: pair.absoluteChange,
        percentageChange: pair.percentageChange,
        contribution: row.contributionToSalesChange,
      },
      rankScore: scoreAbs(pair.absoluteChange, 1.05),
    });
  }
}

function cashierInsights(
  result: BusinessMovementWithMoneyResult,
  thresholds: ReturnType<typeof resolveInsightThresholds>,
  out: RankedBusinessMovementInsight[],
): void {
  const active = result.cashiers.filter(
    (c) => c.salesValuePence.current > 0 || c.salesValuePence.comparison > 0,
  );
  if (active.length < 2) return;

  const ranked = [...active].sort(
    (a, b) => Math.abs(b.salesValuePence.absoluteChange) - Math.abs(a.salesValuePence.absoluteChange),
  );
  const top = ranked[0];
  if (!top) return;
  if (Math.abs(top.salesValuePence.absoluteChange) < thresholds.minAbsSalesDeltaPence) return;

  const described = describeChangeVsComparison(top.salesValuePence, `${top.cashierName} sales`);
  pushInsight(out, {
    id: `cashier-movement-${top.cashierUserId}`,
    category: 'cashier_movement',
    severity: 'info',
    confidence: 'medium',
    fact: described.factClause,
    evidence: `Cashier invoice sales current ${formatGhPence(top.salesValuePence.current)} vs comparison ${formatGhPence(top.salesValuePence.comparison)}.`,
    signal: 'Largest cashier sales movement this period (informational — not a performance judgement).',
    recommendedCheck: 'Compare shift coverage and void patterns on Weekly Digest / Risk Monitor if needed.',
    supportingMetrics: {
      cashierUserId: top.cashierUserId,
      absoluteChangePence: top.salesValuePence.absoluteChange,
      percentageChange: top.salesValuePence.percentageChange,
    },
    rankScore: scoreAbs(top.salesValuePence.absoluteChange, 0.7),
  });
}

function moneyInsights(
  result: BusinessMovementWithMoneyResult,
  thresholds: ReturnType<typeof resolveInsightThresholds>,
  out: RankedBusinessMovementInsight[],
): void {
  if (result.moneyQueryFailed) {
    pushInsight(out, {
      id: 'money-insufficient',
      category: 'insufficient_data',
      severity: 'watch',
      confidence: 'low',
      fact: 'Money Received layer could not be loaded for one or both periods',
      evidence: result.moneyQueryError ?? 'moneyQueryFailed=true',
      signal: 'Sales movement is still available; cash metrics are incomplete.',
      recommendedCheck: 'Retry the report. If it persists, check Money Received directly for the same dates.',
      supportingMetrics: {},
      rankScore: thresholds.minAbsSalesDeltaPence,
    });
    return;
  }

  const gapCurrent = result.leakage.salesMinusMoneyReceivedCurrentPence;
  const gapChange = result.leakage.salesVsMoneyReceivedGapChangePence;
  if (
    gapCurrent != null &&
    Math.abs(gapCurrent) >= thresholds.minAbsGapPence
  ) {
    const gapFact =
      gapCurrent > 0
        ? `Sales exceed Money Received by ${formatGhPence(gapCurrent)} in the current period`
        : `Money Received exceeds Sales by ${formatGhPence(-gapCurrent)} in the current period`;
    pushInsight(out, {
      id: 'money-received-gap',
      category: 'money_received_gap',
      severity: 'watch',
      confidence: 'medium',
      fact: gapFact,
      evidence: `Sales ${formatGhPence(result.leakage.salesValue.current)} (createdAt) vs Money Received ${formatGhPence(result.leakage.moneyReceived.current)} (receivedAt, CONFIRMED). Gap change ${formatSignedGhPence(gapChange ?? 0)}.`,
      signal: BUSINESS_MOVEMENT_MONEY_LANGUAGE.gapIndicator,
      recommendedCheck:
        'Review credit sales timing, late collections, and Needs MoMo confirmation — do not treat this gap as a balancing error.',
      supportingMetrics: {
        salesCurrentPence: result.leakage.salesValue.current,
        moneyReceivedCurrentPence: result.leakage.moneyReceived.current,
        gapCurrentPence: gapCurrent,
        gapChangePence: gapChange,
      },
      rankScore: scoreAbs(gapCurrent, 1.0),
    });
  }

  const refunds = result.money.refundOutflows;
  if (refunds.absoluteChange >= thresholds.minAbsRefundDeltaPence) {
    const described = describeChangeVsComparison(refunds, 'Refund outflows');
    pushInsight(out, {
      id: 'refund-increase',
      category: 'refund_increase',
      severity: 'attention',
      confidence: 'high',
      fact: described.factClause,
      evidence: `Refund outflows current ${formatGhPence(refunds.current)} vs comparison ${formatGhPence(refunds.comparison)}. ${BUSINESS_MOVEMENT_MONEY_LANGUAGE.refunds}`,
      signal: 'Refund cash-out rose vs the comparison period.',
      recommendedCheck: 'Review returns on Sales / Risk Monitor for the same period.',
      supportingMetrics: {
        refundCurrentPence: refunds.current,
        refundComparisonPence: refunds.comparison,
        absoluteChangePence: refunds.absoluteChange,
        percentageChange: refunds.percentageChange,
      },
      rankScore: scoreAbs(refunds.absoluteChange, 1.1),
    });
  }

  const amends = result.money.saleAmendMoneyOut;
  if (amends.absoluteChange >= thresholds.minAbsAmendDeltaPence) {
    const described = describeChangeVsComparison(amends, 'Sale-amend money-out');
    pushInsight(out, {
      id: 'sale-amend-increase',
      category: 'sale_amend_increase',
      severity: 'watch',
      confidence: 'high',
      fact: described.factClause,
      evidence: `Absolute negative CONFIRMED payment outflow current ${formatGhPence(amends.current)} vs comparison ${formatGhPence(amends.comparison)}. ${BUSINESS_MOVEMENT_MONEY_LANGUAGE.saleAmends}`,
      signal: 'More sale-amend money-out was recorded; it still nets inside Money Received.',
      recommendedCheck: 'Review amended sales in the period and confirm cashiers understand amend impact on receipts.',
      supportingMetrics: {
        amendOutCurrentPence: amends.current,
        amendOutComparisonPence: amends.comparison,
        absoluteChangePence: amends.absoluteChange,
      },
      rankScore: scoreAbs(amends.absoluteChange, 0.85),
    });
  }

  const momo = result.money.needsMomoConfirmation;
  const momoMaterial =
    momo.current >= thresholds.minAbsMomoDeltaPence ||
    momo.absoluteChange >= thresholds.minAbsMomoDeltaPence;
  if (momoMaterial) {
    const fact =
      momo.comparison === 0 && momo.current > 0
        ? `Needs MoMo confirmation is ${formatGhPence(momo.current)} this period (no comparison base)`
        : describeChangeVsComparison(momo, 'Needs MoMo confirmation').factClause;

    pushInsight(out, {
      id: 'momo-confirmation-risk',
      category: 'momo_confirmation_risk',
      severity: momo.current >= thresholds.minAbsSalesDeltaPence ? 'attention' : 'watch',
      confidence: 'high',
      fact,
      evidence: `Needs MoMo confirmation current ${formatGhPence(momo.current)} vs comparison ${formatGhPence(momo.comparison)}. ${BUSINESS_MOVEMENT_MONEY_LANGUAGE.pendingMomo}`,
      signal: 'These amounts need confirmation before they count as Money Received.',
      recommendedCheck: 'Open MoMo Confirmation Review and confirm or clear pending Mobile Money payments.',
      supportingMetrics: {
        needsMomoCurrentPence: momo.current,
        needsMomoComparisonPence: momo.comparison,
        absoluteChangePence: momo.absoluteChange,
        percentageChange: momo.percentageChange,
      },
      rankScore: scoreAbs(Math.max(momo.current, momo.absoluteChange), 1.05),
    });
  }

  // Money Received MoM is exposed on the money layer for UI/export.
  // Ranked insights use money_received_gap only for sales−MR clock gaps (not MoM MR alone).
}

/**
 * Generate all candidate insights, ranked by value movement (then category weight).
 */
export function rankBusinessMovementInsights(
  result: BusinessMovementWithMoneyResult,
  options?: InsightEngineOptions,
): RankedBusinessMovementInsight[] {
  const thresholds = resolveInsightThresholds(options);
  const out: RankedBusinessMovementInsight[] = [];

  salesHeadlineInsights(result, thresholds, out);
  productInsights(result, thresholds, out);
  branchInsights(result, thresholds, out);
  cashierInsights(result, thresholds, out);
  moneyInsights(result, thresholds, out);

  if (out.length === 0) {
    pushInsight(out, {
      id: 'insufficient-or-flat',
      category: 'insufficient_data',
      severity: 'info',
      confidence: 'medium',
      fact: 'No material sales or money movements passed the insight thresholds for this period pair',
      evidence: `Noise floor sales Δ < ${formatGhPence(thresholds.minAbsSalesDeltaPence)} (and related money thresholds).`,
      signal: 'Quiet period — or data too thin for ranked insights.',
      recommendedCheck: 'Widen the date range or check that sales were recorded for both periods.',
      supportingMetrics: {
        salesAbsoluteChangePence: result.headline.salesValuePence.absoluteChange,
      },
      rankScore: 0,
    });
  }

  return out.sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id));
}

/**
 * Owner summary: 3–6 insights, capped per category, plain language, no stock causation.
 */
export function buildOwnerInsightSummary(
  result: BusinessMovementWithMoneyResult,
  options?: InsightEngineOptions,
): OwnerInsightSummary {
  const thresholds = resolveInsightThresholds(options);
  const ranked = rankBusinessMovementInsights(result, options);
  const selected: RankedBusinessMovementInsight[] = [];
  const perCategory = new Map<InsightCategory, number>();

  for (const insight of ranked) {
    if (selected.length >= thresholds.ownerSummaryMax) break;
    const count = perCategory.get(insight.category) ?? 0;
    if (count >= thresholds.maxPerCategory) continue;
    selected.push(insight);
    perCategory.set(insight.category, count + 1);
  }

  // Prefer at least ownerSummaryMin when available
  if (selected.length < thresholds.ownerSummaryMin) {
    for (const insight of ranked) {
      if (selected.length >= thresholds.ownerSummaryMin) break;
      if (selected.some((s) => s.id === insight.id)) continue;
      selected.push(insight);
    }
  }

  // Hard cap 6
  const insights = selected.slice(0, Math.min(6, thresholds.ownerSummaryMax));

  const headline =
    insights[0] != null
      ? insights[0].fact
      : 'No key movements to summarise for this period pair.';

  // Final stock-language sweep
  for (const insight of insights) {
    assertNoStockCause(insight);
  }

  return {
    insights,
    headline,
    stockAvailabilityReadiness: STOCK_AVAILABILITY_READINESS,
    stockCauseLanguagePresent: false,
  };
}

export function insightTextBlob(summary: OwnerInsightSummary): string {
  return summary.insights
    .map((i) => `${i.fact} ${i.evidence} ${i.signal} ${i.recommendedCheck}`)
    .join('\n')
    .toLowerCase();
}

export function assertOwnerSummaryHasNoStockCause(summary: OwnerInsightSummary): void {
  const blob = insightTextBlob(summary);
  for (const phrase of FORBIDDEN_STOCK_CAUSE_PHRASES) {
    if (blob.includes(phrase)) {
      throw new Error(`Forbidden stock phrase present: ${phrase}`);
    }
  }
}

export type { InsightConfidence, InsightSeverity };
