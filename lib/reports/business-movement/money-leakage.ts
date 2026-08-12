import {
  computeMoneyReceivedMetrics,
  isConfirmedReceipt,
  isUnverifiedLegacyStatus,
  type MoneyMovementFacts,
  type ReportingScopeContext,
} from '@/lib/reports/money-received';

import { buildChangePair } from './change-math';
import { BUSINESS_MOVEMENT_MONEY_LANGUAGE_NOTES } from './money-language';
import type {
  LeakageQualitySummary,
  MoneyMovementLayer,
  MoneyPeriodFacts,
  SalesHeadlineMovement,
} from './types';

export function moneyPeriodFactsFromCanonicalMetrics(input: {
  moneyReceivedPence: number | null;
  refundOutflowsPence: number | null;
  needsMomoConfirmationPence: number | null;
  moneyReceivedRecordCount: number;
  refundRecordCount: number;
  needsMomoRecordCount: number;
  saleAmendMoneyOutPence: number;
  saleAmendRecordCount: number;
  queryFailed?: boolean;
  queryError?: string | null;
}): MoneyPeriodFacts {
  if (input.queryFailed) {
    return {
      moneyReceivedPence: 0,
      refundOutflowsPence: 0,
      saleAmendMoneyOutPence: 0,
      needsMomoConfirmationPence: 0,
      moneyReceivedRecordCount: 0,
      refundRecordCount: 0,
      saleAmendRecordCount: 0,
      needsMomoRecordCount: 0,
      queryFailed: true,
      queryError: input.queryError ?? 'Query failed',
    };
  }
  return {
    moneyReceivedPence: input.moneyReceivedPence ?? 0,
    refundOutflowsPence: input.refundOutflowsPence ?? 0,
    saleAmendMoneyOutPence: input.saleAmendMoneyOutPence,
    needsMomoConfirmationPence: input.needsMomoConfirmationPence ?? 0,
    moneyReceivedRecordCount: input.moneyReceivedRecordCount,
    refundRecordCount: input.refundRecordCount,
    saleAmendRecordCount: input.saleAmendRecordCount,
    needsMomoRecordCount: input.needsMomoRecordCount,
    queryFailed: false,
    queryError: null,
  };
}

/**
 * Derive sale-amend money-out from the same receipt population as Money Received
 * (CONFIRMED receipts in scope with amountPence < 0). Does not change money_received.
 * Returns absolute outflow (positive pence).
 */
export function saleAmendMoneyOutFromFacts(
  facts: MoneyMovementFacts,
  scope: ReportingScopeContext,
): { saleAmendMoneyOutPence: number; saleAmendRecordCount: number } {
  let out = 0;
  let count = 0;
  const start = scope.periodStart.getTime();
  const end = scope.periodEndExclusive.getTime();
  for (const r of facts.receipts) {
    if (!isConfirmedReceipt(r.status)) continue;
    const t = r.receivedAt.getTime();
    if (t < start || t >= end) continue;
    if (scope.branchIds !== null) {
      if (r.branchId === null || !scope.branchIds.includes(r.branchId)) continue;
    }
    if (r.amountPence < 0) {
      out += -r.amountPence;
      count += 1;
    }
  }
  return { saleAmendMoneyOutPence: out, saleAmendRecordCount: count };
}

/** Extract MoneyPeriodFacts from canonical computeMoneyReceivedMetrics + amend side metric. */
export function moneyPeriodFactsFromMovementFacts(
  facts: MoneyMovementFacts,
  scope: ReportingScopeContext,
): MoneyPeriodFacts {
  if (facts.queryFailed) {
    return moneyPeriodFactsFromCanonicalMetrics({
      moneyReceivedPence: null,
      refundOutflowsPence: null,
      needsMomoConfirmationPence: null,
      moneyReceivedRecordCount: 0,
      refundRecordCount: 0,
      needsMomoRecordCount: 0,
      saleAmendMoneyOutPence: 0,
      saleAmendRecordCount: 0,
      queryFailed: true,
      queryError: facts.queryError ?? 'Query failed',
    });
  }

  const metrics = computeMoneyReceivedMetrics(facts, scope);
  const byId = Object.fromEntries(metrics.map((m) => [m.metricId, m]));
  const amend = saleAmendMoneyOutFromFacts(facts, scope);

  // Parity check helper consumers: money_received must equal confirmed sum including negatives.
  return moneyPeriodFactsFromCanonicalMetrics({
    moneyReceivedPence: byId.money_received?.valuePence ?? 0,
    refundOutflowsPence: byId.refund_outflows?.valuePence ?? 0,
    needsMomoConfirmationPence: byId.unverified_legacy_receipts?.valuePence ?? 0,
    moneyReceivedRecordCount: byId.money_received?.recordCount ?? 0,
    refundRecordCount: byId.refund_outflows?.recordCount ?? 0,
    needsMomoRecordCount: byId.unverified_legacy_receipts?.recordCount ?? 0,
    saleAmendMoneyOutPence: amend.saleAmendMoneyOutPence,
    saleAmendRecordCount: amend.saleAmendRecordCount,
  });
}

export function buildMoneyMovementLayer(
  current: MoneyPeriodFacts,
  comparison: MoneyPeriodFacts,
  moneyReceivedDefinitionVersion: string,
): MoneyMovementLayer {
  return {
    moneyReceived: buildChangePair(current.moneyReceivedPence, comparison.moneyReceivedPence),
    refundOutflows: buildChangePair(current.refundOutflowsPence, comparison.refundOutflowsPence),
    saleAmendMoneyOut: buildChangePair(
      current.saleAmendMoneyOutPence,
      comparison.saleAmendMoneyOutPence,
    ),
    needsMomoConfirmation: buildChangePair(
      current.needsMomoConfirmationPence,
      comparison.needsMomoConfirmationPence,
    ),
    moneyReceivedDefinitionVersion,
  };
}

export function buildLeakageQualitySummary(input: {
  salesHeadline: SalesHeadlineMovement;
  money: MoneyMovementLayer;
}): LeakageQualitySummary {
  const salesValue = input.salesHeadline.salesValuePence;
  const { moneyReceived, refundOutflows, saleAmendMoneyOut, needsMomoConfirmation } = input.money;

  return {
    salesValue,
    moneyReceived,
    refundOutflows,
    saleAmendMoneyOut,
    needsMomoConfirmation,
    salesMinusMoneyReceivedCurrentPence: salesValue.current - moneyReceived.current,
    salesMinusMoneyReceivedComparisonPence: salesValue.comparison - moneyReceived.comparison,
    salesVsMoneyReceivedGapChangePence:
      salesValue.absoluteChange - moneyReceived.absoluteChange,
    languageNotes: BUSINESS_MOVEMENT_MONEY_LANGUAGE_NOTES,
  };
}

/** Re-export for tests that assert PENDING_MANUAL classification without forking. */
export { isUnverifiedLegacyStatus, isConfirmedReceipt };
