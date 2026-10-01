/**
 * Sales Analytics stays in Activity until Trading actually covers every
 * capability an entitled Growth or Pro customer already has there.
 * This flag is evidence, not a plan to hide a paid report early.
 *
 * Stage 3B still has to add, inside Trading, without a second calculation:
 * - category breakdown
 * - hourly pattern and peak hour
 * - previous-period comparison chart and growth
 * - average sale value as its own figure
 * - a discounts total (Trading does not show one today)
 * - 14-day and 90-day presets (Trading offers today, last 7 days and custom)
 * - an analytics export, if Sales Analytics is given one later
 *
 * Trading already has, and Sales Analytics does not:
 * - returns and voids
 * - payment-method mix
 * - explicit branch choice, including Pro consolidation
 * - expenses, credit sales and supplier balances (operational, not a statement)
 *
 * Neither route is deleted. Neither is redirected at the other.
 */
export const TRADING_COVERS_SALES_ANALYTICS = false;

export const SALES_ANALYTICS_PARITY_GAPS: readonly string[] = [
  'category breakdown',
  'hourly pattern',
  'previous-period comparison',
  'average sale value',
  'discounts total',
  '14-day and 90-day presets',
];

export function tradingReplacesSalesAnalytics(): boolean {
  return TRADING_COVERS_SALES_ANALYTICS && SALES_ANALYTICS_PARITY_GAPS.length === 0;
}
