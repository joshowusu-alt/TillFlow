/**
 * Improve Your Records — shared thresholds.
 * Conservative default for established businesses: catalogue SKUs older than
 * this with no trading/stock activity are treated as unused catalogue, not
 * unfinished opening stock.
 */
export const UNUSED_CATALOGUE_AGE_DAYS = 14;

/** Payment statuses that imply an outstanding payable needing a supplier. */
export const PURCHASE_PAYABLE_STATUSES = ['UNPAID', 'PARTIAL', 'PART_PAID'] as const;

/** Opening-stock stock-movement markers — never treated as supplier AP. */
export const OPENING_STOCK_MOVEMENT_TYPES = ['OPENING'] as const;
export const OPENING_STOCK_REFERENCE_TYPES = [
  'OPENING_STOCK',
  'OPENING_BALANCE_INVENTORY',
] as const;
