/**
 * Careful language for Business Movement money/leakage (deterministic, not AI).
 * Presentation copy helpers — do not change economics.
 */

export const BUSINESS_MOVEMENT_MONEY_LANGUAGE = {
  salesVsMoney:
    'Sales (invoice createdAt) is not the same as Money Received (payment receivedAt, CONFIRMED only).',
  pendingMomo:
    'Needs MoMo confirmation (PENDING_MANUAL / unclassified) is not counted in Money Received until CONFIRMED.',
  refunds:
    'Refund outflows are cash-out tracked separately — they are not subtracted from the Money Received headline.',
  saleAmends:
    'Sale-amend negative payments remain inside Money Received under the current contract (they net the total).',
  gapIndicator:
    'Sales minus Money Received is a timing/quality indicator (credit sales, late collections, pending MoMo) — not an error total.',
} as const;

export const BUSINESS_MOVEMENT_MONEY_LANGUAGE_NOTES: readonly string[] = [
  BUSINESS_MOVEMENT_MONEY_LANGUAGE.salesVsMoney,
  BUSINESS_MOVEMENT_MONEY_LANGUAGE.pendingMomo,
  BUSINESS_MOVEMENT_MONEY_LANGUAGE.refunds,
  BUSINESS_MOVEMENT_MONEY_LANGUAGE.saleAmends,
  BUSINESS_MOVEMENT_MONEY_LANGUAGE.gapIndicator,
];
