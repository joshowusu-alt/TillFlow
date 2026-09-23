/**
 * Product-rank revenue for sales_activity group-bys.
 * Line net before tax: lineSubtotalPence - lineDiscountPence - promoDiscountPence.
 * Invoice-level discount allocation stays in the margin calculation and is not
 * reapplied here. Not stamped authoritative v1.
 */
export function productRankRevenuePence(line: {
  lineSubtotalPence: number;
  lineDiscountPence: number;
  promoDiscountPence: number;
}): number {
  return line.lineSubtotalPence - line.lineDiscountPence - line.promoDiscountPence;
}

export const PRODUCT_RANK_REVENUE_FIELD = 'lineSubtotalPence - lineDiscountPence - promoDiscountPence';
