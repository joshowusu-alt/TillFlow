/**
 * Step 6H — Owner-facing copy. Presentation only.
 * Does not change ranking, Money Received, or change maths.
 */

import { formatGhPence } from './insight-format';
import type {
  InsightCategory,
  InsightConfidence,
  RankedBusinessMovementInsight,
} from './insight-types';
import type {
  BranchMovementRow,
  BusinessMovementPeriodPair,
  BusinessMovementWithMoneyResult,
  CashierMovementRow,
  ChangePair,
  EntityMovementKind,
  ProductMovementRow,
} from './types';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const OWNER_STOCK_DATA_NOTE =
  'Historical stock availability is not yet reliable. This report does not attribute sales movement to stock-outs or inventory gaps.';

export const OWNER_CATEGORY_LABEL: Record<InsightCategory, string> = {
  sales_growth: 'Sales grew',
  sales_drop: 'Sales dropped',
  product_growth: 'Product grew',
  product_decline: 'Product dropped',
  branch_growth: 'Branch grew',
  branch_drop: 'Branch dropped',
  cashier_movement: 'Cashier movement',
  money_received_gap: 'Sales vs money',
  refund_increase: 'Refunds rose',
  sale_amend_increase: 'Sale amends rose',
  momo_confirmation_risk: 'MoMo to confirm',
  insufficient_data: 'Not enough data',
};

const CONTRIBUTION_SIGNAL_RE =
  /(?:accounted for|contributed) (-?\d+(?:\.\d+)?)% of (product|branch)-level sales change/i;

export function ownerCategoryLabel(category: InsightCategory): string {
  return OWNER_CATEGORY_LABEL[category];
}

export function ownerConfidenceHint(confidence: InsightConfidence): string | null {
  return confidence === 'high' ? 'Strong signal' : null;
}

/** Hide contribution % over 100 and drop internal “product-level” jargon. */
export function ownerWhyItMatters(signal: string): string {
  const match = signal.match(CONTRIBUTION_SIGNAL_RE);
  if (!match) return signal;
  const pct = Math.abs(Number(match[1]));
  const kind = match[2]?.toLowerCase();
  if (!Number.isFinite(pct) || pct > 100) {
    return kind === 'branch'
      ? 'This was among the largest branch movements.'
      : 'This was among the largest product movements.';
  }
  return kind === 'branch'
    ? 'This branch was a large part of the sales change.'
    : 'This product was a large part of the sales change.';
}

export function productMoverSideLabel(row: {
  kind: EntityMovementKind;
  salesValuePence: ChangePair;
}): string {
  if (row.kind === 'new' || (row.salesValuePence.comparison === 0 && row.salesValuePence.current > 0)) {
    return 'New product';
  }
  if (
    row.kind === 'no_current_sales' ||
    (row.salesValuePence.current === 0 && row.salesValuePence.comparison > 0)
  ) {
    return 'No current sales';
  }
  if (row.salesValuePence.absoluteChange > 0) return 'Grew';
  if (row.salesValuePence.absoluteChange < 0) return 'Dropped';
  return 'Unchanged';
}

export function productQtyWording(
  qtyCurrent: number,
  qtyComparison: number,
  comparisonLabel: string,
): string {
  return `${qtyCurrent} sold vs ${qtyComparison} in ${comparisonLabel}`;
}

export function shouldCollapseEntityTable(rows: unknown[]): boolean {
  return rows.length <= 1;
}

export function singleBranchNote(branches: BranchMovementRow[]): string | null {
  if (branches.length === 0) return 'No branch sales in either period.';
  if (branches.length === 1) {
    const name = branches[0]?.storeName?.trim() || 'this branch';
    return `All movement is from ${name}.`;
  }
  return null;
}

export function singleCashierNote(cashiers: CashierMovementRow[]): string | null {
  if (cashiers.length === 0) return 'No cashier-attributed sales in either period.';
  if (cashiers.length === 1) {
    const name = cashiers[0]?.cashierName?.trim() || 'one cashier';
    return `Sales in this view are attributed to ${name}.`;
  }
  return null;
}

function parseDateKey(key: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isFullCalendarMonth(
  from: { year: number; month: number; day: number },
  to: { year: number; month: number; day: number },
): boolean {
  return (
    from.year === to.year &&
    from.month === to.month &&
    from.day === 1 &&
    to.day === lastDayOfMonth(to.year, to.month)
  );
}

function isFullCalendarMonthSpan(
  from: { year: number; month: number; day: number },
  to: { year: number; month: number; day: number },
): boolean {
  return from.day === 1 && to.day === lastDayOfMonth(to.year, to.month);
}

/**
 * Human-readable inclusive range.
 * July 2026 | Jun-Jul 2026 | 1 Jun-17 Jul 2026
 */
export function formatHumanPeriodRange(
  fromKey: string,
  toKey: string,
  style: 'full' | 'short' = 'full',
): string {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to) return `${fromKey} to ${toKey}`;
  const sameYear = from.year === to.year;

  if (isFullCalendarMonth(from, to)) {
    const name = MONTH_NAMES[from.month - 1] ?? fromKey;
    return style === 'short' ? name : `${name} ${from.year}`;
  }

  if (isFullCalendarMonthSpan(from, to)) {
    const a = MONTH_SHORT[from.month - 1];
    const b = MONTH_SHORT[to.month - 1];
    if (sameYear) {
      return style === 'short' ? `${a}-${b}` : `${a}-${b} ${from.year}`;
    }
    return `${a} ${from.year}-${b} ${to.year}`;
  }

  const a = `${from.day} ${MONTH_SHORT[from.month - 1]}`;
  const b = `${to.day} ${MONTH_SHORT[to.month - 1]}`;
  if (sameYear) {
    return style === 'short' ? `${a}-${b}` : `${a}-${b} ${from.year}`;
  }
  return `${a} ${from.year}-${b} ${to.year}`;
}

export function periodMonthLabel(fromKey: string, toKey: string): string {
  return formatHumanPeriodRange(fromKey, toKey, 'full');
}

export function shortPeriodLabel(fromKey: string, toKey: string): string {
  return formatHumanPeriodRange(fromKey, toKey, 'short');
}

export type OwnerPeriodLabels = {
  currentFull: string;
  comparisonFull: string;
  currentShort: string;
  comparisonShort: string;
  comparingLine: string;
  currentRangeKeys: string;
  comparisonRangeKeys: string;
};

export function ownerPeriodLabels(periods: BusinessMovementPeriodPair): OwnerPeriodLabels {
  const currentFull = formatHumanPeriodRange(periods.currentFromKey, periods.currentToKey, 'full');
  const comparisonFull = formatHumanPeriodRange(
    periods.comparisonFromKey,
    periods.comparisonToKey,
    'full',
  );
  const currentShort = formatHumanPeriodRange(periods.currentFromKey, periods.currentToKey, 'short');
  const comparisonShort = formatHumanPeriodRange(
    periods.comparisonFromKey,
    periods.comparisonToKey,
    'short',
  );
  return {
    currentFull,
    comparisonFull,
    currentShort,
    comparisonShort,
    comparingLine: `Comparing: ${currentFull} vs ${comparisonFull}`,
    currentRangeKeys: `${periods.currentFromKey} → ${periods.currentToKey}`,
    comparisonRangeKeys: `${periods.comparisonFromKey} → ${periods.comparisonToKey}`,
  };
}

/** Replace vague “last period” / “comparison period” with named ranges. */
export function rewriteOwnerPeriodCopy(text: string, labels: OwnerPeriodLabels): string {
  return text
    .replace(/vs the comparison period/gi, `compared with ${labels.comparisonFull}`)
    .replace(/vs comparison period/gi, `compared with ${labels.comparisonFull}`)
    .replace(/in the comparison period/gi, `in ${labels.comparisonFull}`)
    .replace(/the comparison period/gi, labels.comparisonFull)
    .replace(/comparison period/gi, labels.comparisonFull)
    .replace(/in the current period/gi, `in ${labels.currentFull}`)
    .replace(/the current period/gi, labels.currentFull)
    .replace(/current-period/gi, labels.currentFull)
    .replace(/vs last period/gi, `vs ${labels.comparisonFull}`)
    .replace(/ last period/gi, ` in ${labels.comparisonFull}`)
    .replace(/last period/gi, labels.comparisonFull)
    .replace(/this period pair/gi, `${labels.currentFull} vs ${labels.comparisonFull}`)
    .replace(/this period/gi, `in ${labels.currentFull}`);
}

export function ownerInsightCopy(
  insight: RankedBusinessMovementInsight,
  labels: OwnerPeriodLabels,
): { fact: string; evidence: string; signal: string; recommendedCheck: string } {
  return {
    fact: rewriteOwnerPeriodCopy(insight.fact, labels),
    evidence: rewriteOwnerPeriodCopy(insight.evidence, labels),
    signal: rewriteOwnerPeriodCopy(ownerWhyItMatters(insight.signal), labels),
    recommendedCheck: rewriteOwnerPeriodCopy(insight.recommendedCheck, labels),
  };
}

function movementClause(
  pair: ChangePair,
  noun: string,
  currentLabel: string,
  comparisonLabel: string,
): string {
  const abs = formatGhPence(Math.abs(pair.absoluteChange));
  if (pair.comparison === 0 && pair.current === 0) {
    return `${currentLabel} ${noun} had no activity in either period`;
  }
  if (pair.comparison === 0 && pair.current > 0) {
    return `${currentLabel} ${noun} is ${formatGhPence(pair.current)} — new in ${currentLabel} (no comparison base)`;
  }
  if (pair.current === 0 && pair.comparison > 0) {
    return `${currentLabel} ${noun} had ${formatGhPence(pair.comparison)} in ${comparisonLabel} and none in ${currentLabel}`;
  }
  if (pair.absoluteChange < 0) {
    return `${currentLabel} ${noun} ${noun === 'sales' ? 'were' : 'was'} down ${abs} compared with ${comparisonLabel}`;
  }
  if (pair.absoluteChange > 0) {
    return `${currentLabel} ${noun} ${noun === 'sales' ? 'were' : 'was'} up ${abs} compared with ${comparisonLabel}`;
  }
  return `${currentLabel} ${noun} ${noun === 'sales' ? 'were' : 'was'} about the same as ${comparisonLabel}`;
}

const RISK_CATEGORY_ORDER: InsightCategory[] = [
  'momo_confirmation_risk',
  'refund_increase',
  'money_received_gap',
  'sale_amend_increase',
  'sales_drop',
];

function biggestCheckSentence(
  insights: RankedBusinessMovementInsight[],
  money: BusinessMovementWithMoneyResult['money'],
  currentLabel: string,
  comparisonLabel: string,
): string | null {
  const byCategory = new Map(insights.map((i) => [i.category, i]));
  for (const category of RISK_CATEGORY_ORDER) {
    const hit = byCategory.get(category);
    if (!hit) continue;
    if (category === 'momo_confirmation_risk') {
      const momo = money.needsMomoConfirmation;
      const abs = formatGhPence(Math.abs(momo.absoluteChange));
      if (momo.comparison === 0 && momo.current > 0) {
        return `MoMo needing confirmation is ${formatGhPence(momo.current)} in ${currentLabel}, so confirm pending MoMo before judging cash performance.`;
      }
      if (momo.absoluteChange > 0) {
        return `MoMo needing confirmation rose by ${abs}, so confirm pending MoMo before judging cash performance.`;
      }
      return 'Confirm pending MoMo before judging cash performance.';
    }
    if (category === 'refund_increase') {
      return `Refunds rose vs ${comparisonLabel} — review returns before treating the period as weaker demand.`;
    }
    if (category === 'money_received_gap') {
      return 'Sales and Money Received can differ because they use different clocks — check Money Received before treating the gap as an error.';
    }
    if (category === 'sale_amend_increase') {
      return 'Sale-amend money-out rose — review amended sales before judging receipts.';
    }
    if (category === 'sales_drop') {
      return `See product movers below to check where ${currentLabel} sales concentrated.`;
    }
  }
  return null;
}

export type OwnerSummaryStrip = {
  sales: string;
  moneyReceived: string;
  biggestCheck: string | null;
  paragraph: string;
};

export function buildOwnerSummaryStrip(
  result: BusinessMovementWithMoneyResult,
  insights: RankedBusinessMovementInsight[],
): OwnerSummaryStrip {
  const p = result.scope.periods;
  const currentLabel = shortPeriodLabel(p.currentFromKey, p.currentToKey);
  const comparisonLabel = shortPeriodLabel(p.comparisonFromKey, p.comparisonToKey);
  const sales = movementClause(
    result.headline.salesValuePence,
    'sales',
    currentLabel,
    comparisonLabel,
  );
  const moneyReceived = result.moneyQueryFailed
    ? 'Money received could not be loaded for this comparison'
    : movementClause(result.money.moneyReceived, 'money received', currentLabel, comparisonLabel);
  const biggestCheck = biggestCheckSentence(
    insights,
    result.money,
    currentLabel,
    comparisonLabel,
  );
  const paragraph = [sales, moneyReceived, biggestCheck].filter(Boolean).join('. ') + '.';
  return { sales, moneyReceived, biggestCheck, paragraph };
}

export function ownerPeriodChrome(periods: BusinessMovementPeriodPair): OwnerPeriodLabels & {
  currentLabel: string;
  comparisonLabel: string;
} {
  const labels = ownerPeriodLabels(periods);
  return {
    ...labels,
    currentLabel: labels.currentFull,
    comparisonLabel: labels.comparisonFull,
  };
}

export type OwnerProductMover = {
  productId: string;
  productName: string;
  side: string;
  currentPence: number;
  comparisonPence: number;
  changePence: number;
  qtyWording: string;
};

export function ownerProductMovers(result: BusinessMovementWithMoneyResult): OwnerProductMover[] {
  const comparisonLabel = shortPeriodLabel(
    result.scope.periods.comparisonFromKey,
    result.scope.periods.comparisonToKey,
  );
  const rows: ProductMovementRow[] = [...result.productDecliners, ...result.productGrowers];
  return rows
    .map((row) => ({
      productId: row.productId,
      productName: row.productName,
      side: productMoverSideLabel(row),
      currentPence: row.salesValuePence.current,
      comparisonPence: row.salesValuePence.comparison,
      changePence: row.salesValuePence.absoluteChange,
      qtyWording: productQtyWording(row.qtyBase.current, row.qtyBase.comparison, comparisonLabel),
    }))
    .sort((a, b) => Math.abs(b.changePence) - Math.abs(a.changePence));
}
