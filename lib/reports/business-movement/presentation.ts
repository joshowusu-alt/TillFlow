import { formatMoney } from '@/lib/format';
import { ownerInsightCopy } from './owner-copy';
import type { OwnerPeriodLabels } from './owner-copy';
import type { BusinessMovementWithMoneyResult, BusinessMovementPeriodPair } from './types';
import type { RankedBusinessMovementInsight } from './insight-types';

/** Presentation only. Ranking, arithmetic, query windows and export values stay intact. */
export function movementDisplayText(text: string, currency = 'GHS') {
  return text.replace(/([+−-]?)GH¢(\d+)\.(\d{2})/g, (_match, sign, whole, fraction) => {
    const pence = Number(whole) * 100 + Number(fraction);
    return `${sign === '-' ? '−' : sign}${formatMoney(pence, currency)}`;
  });
}

export function movementDisplayCopy(insight: RankedBusinessMovementInsight, labels: OwnerPeriodLabels, currency: string) {
  const copy = ownerInsightCopy(insight, labels);
  const recommendedCheck = insight.category === 'money_received_gap'
    ? 'Review the receipts, payment dates and pending confirmations. The totals alone do not explain the gap.'
    : insight.category === 'sales_growth' || insight.category === 'sales_drop'
    ? 'Review the product changes below to see where sales increased or decreased.'
    : insight.category === 'product_growth'
      ? 'Review current stock and purchases before deciding whether to reorder.'
      : copy.recommendedCheck;
  return {
    fact: movementDisplayText(copy.fact.replace(/is new in (.*?) at (.*?) \(no comparison base\)/, 'recorded $2 in $1, with no sales in the earlier period'), currency),
    evidence: movementDisplayText(copy.evidence, currency),
    signal: movementDisplayText(copy.signal, currency),
    recommendedCheck: movementDisplayText(recommendedCheck, currency),
  };
}

export function visibleMovementInsights(insights: RankedBusinessMovementInsight[], result: BusinessMovementWithMoneyResult) {
  const branch = result.branches.length === 1 ? result.branches[0] : null;
  const repeatsHeadline = branch
    && branch.salesValuePence.current === result.headline.salesValuePence.current
    && branch.salesValuePence.comparison === result.headline.salesValuePence.comparison;
  // Do not pad the remaining cards or change the engine's ranking.
  return insights.filter((insight) => !(repeatsHeadline
    && (insight.category === 'branch_growth' || insight.category === 'branch_drop')));
}

function calendarDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export function movementPeriodNote(periods: BusinessMovementPeriodPair) {
  const current = calendarDays(periods.currentFromKey, periods.currentToKey);
  const previous = calendarDays(periods.comparisonFromKey, periods.comparisonToKey);
  return {
    currentDays: current,
    comparisonDays: previous,
    explanation: current === previous
      ? 'Both periods cover the same number of calendar days.'
      : 'These calendar months have different lengths. Changes compare totals, not daily averages.',
  };
}

export function movementGapCopy(gap: number | null, currency: string) {
  if (gap == null) return 'Confirmed receipts could not be loaded.';
  if (gap === 0) return 'Sales and confirmed receipts have the same total for this period.';
  return `${gap > 0 ? 'Sales exceed confirmed receipts' : 'Confirmed receipts exceed sales'} by ${formatMoney(Math.abs(gap), currency)}. Different payment dates can cause a gap; review the receipts to explain it.`;
}
