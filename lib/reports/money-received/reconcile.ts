import { scopesEqualForReconcile } from './scope-clock';
import type { MetricResult, ReconcileResult, ReportingScopeContext } from './types';
import { KNOWN_PAYMENT_METHODS } from './types';

/**
 * ReconciliationService — Money Received identities.
 * CT19: scope mismatch → no reconcile claim.
 */
export function reconcileMoneyReceivedToDetailSum(
  headline: MetricResult,
  detailSumPence: number,
  detailScope: ReportingScopeContext,
): ReconcileResult {
  if (headline.qualityState === 'QUERY_FAILED' || headline.valuePence === null) {
    return { ok: false, reason: 'QUERY_FAILED', headlinePence: null, detailSumPence: null };
  }
  if (!scopesEqualForReconcile(
    {
      businessId: headline.businessId,
      branchIds: headline.branchIds,
      currency: headline.currency,
      timeZone: headline.timeZone,
      periodStart: headline.periodStart,
      periodEndExclusive: headline.periodEndExclusive,
      asOf: headline.asOf,
      definitionVersion: headline.definitionVersion,
    },
    detailScope,
  )) {
    return {
      ok: false,
      reason: 'SCOPE_MISMATCH',
      headlinePence: headline.valuePence,
      detailSumPence: null,
    };
  }
  if (headline.valuePence !== detailSumPence) {
    return {
      ok: false,
      reason: 'AMOUNT_MISMATCH',
      headlinePence: headline.valuePence,
      detailSumPence,
    };
  }
  return {
    ok: true,
    reason: null,
    headlinePence: headline.valuePence,
    detailSumPence,
  };
}

/** Method breakdown must sum to money_received for identical scope (legacy excluded from both). */
export function reconcileMethodBreakdownToMoneyReceived(
  results: MetricResult[],
): ReconcileResult {
  const total = results.find((r) => r.metricId === 'money_received');
  if (!total || total.valuePence === null || total.qualityState === 'QUERY_FAILED') {
    return { ok: false, reason: 'QUERY_FAILED', headlinePence: null, detailSumPence: null };
  }
  const parts = [
    'money_received_cash',
    'money_received_momo',
    'money_received_card',
    'money_received_transfer',
    'money_received_other',
  ].map((id) => results.find((r) => r.metricId === id));
  if (parts.some((p) => !p || p.valuePence === null)) {
    return { ok: false, reason: 'INCOMPLETE_BREAKDOWN', headlinePence: total.valuePence, detailSumPence: null };
  }
  const sum = parts.reduce((acc, p) => acc + (p!.valuePence ?? 0), 0);
  if (sum !== total.valuePence) {
    return {
      ok: false,
      reason: 'METHOD_BREAKDOWN_MISMATCH',
      headlinePence: total.valuePence,
      detailSumPence: sum,
    };
  }
  return {
    ok: true,
    reason: null,
    headlinePence: total.valuePence,
    detailSumPence: sum,
  };
}

export function methodLabel(method: string): string {
  switch (method) {
    case 'CASH':
      return 'Cash';
    case 'MOBILE_MONEY':
      return 'Mobile Money (MoMo)';
    case 'CARD':
      return 'Card';
    case 'TRANSFER':
      return 'Bank Transfer';
    default:
      return (KNOWN_PAYMENT_METHODS as readonly string[]).includes(method) ? method : `Other (${method})`;
  }
}
