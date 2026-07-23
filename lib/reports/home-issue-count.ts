/**
 * Shared Home ↔ Command Center issue-flag counting.
 * Counts how many distinct issue categories are active (0–9), matching
 * the historical getReadiness openIssueCount derivation from TodayKPIs.
 */
import type { TodayKPIs } from '@/lib/reports/today-kpis';

export type HomeIssueFlagSource = Pick<
  TodayKPIs,
  | 'stockoutImminentCount'
  | 'urgentReorderCount'
  | 'arOver60Pence'
  | 'outstandingAPPence'
  | 'cashVarianceTotalPence'
  | 'momoPendingCount'
  | 'negativeMarginProductCount'
  | 'discountOverrideCount'
  | 'openHighAlerts'
>;

/** Number of distinct Command Center issue categories currently active. */
export function countCommandCenterIssueFlags(kpis: HomeIssueFlagSource): number {
  return [
    kpis.stockoutImminentCount > 0,
    kpis.urgentReorderCount > 0,
    kpis.arOver60Pence > 0,
    kpis.outstandingAPPence > 0,
    kpis.cashVarianceTotalPence > 0,
    kpis.momoPendingCount > 0,
    kpis.negativeMarginProductCount > 0,
    kpis.discountOverrideCount > 0,
    kpis.openHighAlerts > 0,
  ].filter(Boolean).length;
}
