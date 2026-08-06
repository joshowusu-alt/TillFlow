/**
 * Existing-record safety policy for Phase 1 (documented + testable constants).
 *
 * Enforcement against live DB rows belongs in P1/P2. P0 locks the rules.
 */

export const EXISTING_RECORD_POLICY = {
  fuzzyMatching: false,
  skuConflict: 'blocking' as const,
  barcodeConflict: 'blocking' as const,
  ambiguousSupplierMatch: 'blocking' as const,
  ambiguousProductMatch: 'blocking' as const,
  deletedMappedTarget: 'MAPPED_TARGET_MISSING' as const,
  silentRetarget: false,
  /**
   * Products/branches with existing inventory or trading activity are not
   * eligible for opening-stock import. No Owner override in Phase 1.
   */
  existingInventoryOrTradingBlocksOpeningStock: true,
  ownerOverrideForLiveStock: false,
} as const;

export function isOpeningStockBlockedByExistingActivity(input: {
  hasInventoryBalance: boolean;
  hasTradingActivity: boolean;
}): boolean {
  if (!EXISTING_RECORD_POLICY.existingInventoryOrTradingBlocksOpeningStock) return false;
  return input.hasInventoryBalance || input.hasTradingActivity;
}

export function mappedTargetMissingCode(): typeof EXISTING_RECORD_POLICY.deletedMappedTarget {
  return EXISTING_RECORD_POLICY.deletedMappedTarget;
}
