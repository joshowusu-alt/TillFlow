/**
 * Step 6D — Deterministic insight ranking types.
 */

export type InsightSeverity = 'info' | 'watch' | 'attention';

export type InsightConfidence = 'high' | 'medium' | 'low';

export type InsightCategory =
  | 'sales_growth'
  | 'sales_drop'
  | 'product_growth'
  | 'product_decline'
  | 'branch_growth'
  | 'branch_drop'
  | 'cashier_movement'
  | 'money_received_gap'
  | 'refund_increase'
  | 'sale_amend_increase'
  | 'momo_confirmation_risk'
  | 'insufficient_data';

export type RankedBusinessMovementInsight = {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  confidence: InsightConfidence;
  fact: string;
  evidence: string;
  signal: string;
  recommendedCheck: string;
  supportingMetrics: Record<string, number | string | null>;
  /** Higher = more important; primarily |value Δ| with category weights */
  rankScore: number;
};

export type OwnerInsightSummary = {
  /** 3–6 key insights for owners */
  insights: RankedBusinessMovementInsight[];
  headline: string;
  stockAvailabilityReadiness: 'NOT_RELIABLE' | 'RELIABLE';
  /** Explicit: 6D does not emit stock-cause insights when NOT_RELIABLE */
  stockCauseLanguagePresent: false;
};

export type InsightEngineOptions = {
  /** Absolute sales/money Δ below this is noise (pence). Default 100_00 */
  minAbsSalesDeltaPence?: number;
  minAbsMoneyDeltaPence?: number;
  minAbsRefundDeltaPence?: number;
  minAbsAmendDeltaPence?: number;
  minAbsMomoDeltaPence?: number;
  minAbsGapPence?: number;
  /** Min |%| when comparison base is meaningful; used as secondary signal only */
  minPctForMention?: number;
  ownerSummaryMax?: number;
  ownerSummaryMin?: number;
  maxPerCategory?: number;
};
