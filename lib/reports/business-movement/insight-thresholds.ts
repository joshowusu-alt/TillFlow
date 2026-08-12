import type { InsightEngineOptions } from './insight-types';

/** Defaults aligned with Step 6A threshold guidance (pence = pesewas). */
export const DEFAULT_INSIGHT_THRESHOLDS = {
  minAbsSalesDeltaPence: 100_00,
  minAbsMoneyDeltaPence: 100_00,
  minAbsRefundDeltaPence: 50_00,
  minAbsAmendDeltaPence: 50_00,
  minAbsMomoDeltaPence: 1_00,
  minAbsGapPence: 100_00,
  minPctForMention: 10,
  ownerSummaryMax: 6,
  ownerSummaryMin: 3,
  maxPerCategory: 2,
} as const satisfies Required<InsightEngineOptions>;

export function resolveInsightThresholds(
  options?: InsightEngineOptions,
): Required<InsightEngineOptions> {
  return {
    ...DEFAULT_INSIGHT_THRESHOLDS,
    ...options,
  };
}

/** Phrases that must never appear while stock readiness is NOT_RELIABLE. */
export const FORBIDDEN_STOCK_CAUSE_PHRASES = [
  'out of stock for',
  'days at zero',
  'days out of stock',
  'stock caused',
  'because of stock',
  'due to stock',
  'stock-out caused',
  'unavailable for',
  'review availability',
] as const;
