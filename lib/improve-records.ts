/**
 * Improve Your Records — Phase 2 recommendation engine.
 * Outcome-based coaching after first sale. Never blocks selling.
 * Urgent operational items belong in Command Center / Today focus — not here.
 */

import type { OpeningBalancesStatus } from '@/lib/opening-balances-status';
import { openingBalancesNeedsAttention } from '@/lib/opening-balances-status';
import { IMPROVE_RECORDS_ISSUE_DEFS } from '@/lib/improve-records-issues';

export type ImproveRecordsRole = 'OWNER' | 'MANAGER' | 'CASHIER';
export type ImproveRecordsPlan = 'STARTER' | 'GROWTH' | 'PRO';

export type ImproveRecordsItemKey =
  | 'missing-costs'
  | 'stock-completeness'
  | 'opening-balances'
  | 'purchases'
  | 'catalogue'
  | 'unused-catalogue'
  | 'suppliers'
  | 'staff'
  | 'momo';

export type ImproveRecordsItem = {
  key: ImproveRecordsItemKey;
  title: string;
  explanation: string;
  actionLabel: string;
  href: string;
  /** Higher = more urgent within the priority ladder. */
  priority: number;
};

export type ImproveRecordsSnapshot = {
  onboardingComplete: boolean;
  saleCount: number;
  productCount: number;
  validProductCount: number;
  sellableProductCount: number;
  /**
   * Products stocked and/or sold without a reliable cost.
   * Sold-out products remain counted until cost is fixed.
   */
  missingCostProductCount: number;
  /**
   * Genuine stock-setup gap: active priced products with no confirmed quantity
   * and evidence the business intends to carry them (recent or sold without stock).
   * Business-wide: any branch InventoryBalance excludes the product.
   * Excludes OOS-after-setup and aged never-traded catalogue.
   */
  productsNeedingOpeningQtyCount: number;
  /** Subset of genuine gap that has sales but no confirmed quantity (wording). */
  soldWithoutConfirmedQtyCount: number;
  /**
   * Aged unused catalogue: active priced, older than threshold, never stocked,
   * never sold, never purchased, never moved. Not unfinished opening stock.
   */
  unusedCatalogueProductCount: number;
  stockValueIncomplete: boolean;
  openingBalancesStatus: OpeningBalancesStatus;
  purchaseCount: number;
  /** Stock increased via non-opening movements without matching purchases. */
  replenishmentWithoutPurchaseDetected: boolean;
  supplierCount: number;
  /**
   * Genuine unpaid/partial PURCHASE invoices missing a supplier.
   * Excludes opening-stock invoices and paid cash with no payable.
   */
  purchasesNeedingSupplierCount: number;
  staffCount: number;
  pendingStaffInviteCount: number;
  momoEnabled: boolean;
  momoNumber: string | null;
  momoProvider: string | null;
  momoActivityDetected: boolean;
  role: ImproveRecordsRole;
  plan: ImproveRecordsPlan;
};

export type ImproveRecordsResult = {
  primary: ImproveRecordsItem | null;
  secondary: ImproveRecordsItem[];
  allClear: boolean;
  allClearMessage: string;
};

export const IMPROVE_RECORDS_ALL_CLEAR_MESSAGE =
  'Your key records are in good shape. TillFlow will surface the next useful improvement when needed.';

const MAX_SECONDARY = 3;

function hasMomoDetails(snapshot: ImproveRecordsSnapshot): boolean {
  return Boolean(snapshot.momoNumber?.trim() && snapshot.momoProvider?.trim());
}

function canAccess(key: ImproveRecordsItemKey, role: ImproveRecordsRole): boolean {
  if (role === 'CASHIER') return false;
  if (role === 'MANAGER') {
    // Managers may handle operational records; not staff invites or MoMo account details.
    return key !== 'staff' && key !== 'momo' && key !== 'opening-balances';
  }
  return true;
}

function stockGapExplanation(snapshot: ImproveRecordsSnapshot): string {
  const n = snapshot.productsNeedingOpeningQtyCount;
  const sold = snapshot.soldWithoutConfirmedQtyCount;
  if (sold > 0 && sold === n) {
    return `${n} active product${n === 1 ? ' was' : 's were'} sold without a confirmed stock quantity.`;
  }
  if (sold > 0) {
    return `${n} active product${n === 1 ? '' : 's'} still need${n === 1 ? 's' : ''} a confirmed stock quantity (${sold} already sold without one).`;
  }
  return `${n} active product${n === 1 ? '' : 's'} still need${n === 1 ? 's' : ''} a confirmed stock quantity.`;
}

function supplierExplanation(n: number): string {
  if (n === 1) {
    return '1 unpaid purchase is missing a supplier, so the amount owed cannot be tracked clearly.';
  }
  return `${n} unpaid purchases are missing a supplier, so amounts owed cannot be tracked clearly.`;
}

/**
 * Build candidate improvements from real outcomes. Order follows the approved
 * priority ladder; callers take the first eligible as primary.
 *
 * Priority (business impact, not raw count):
 * 1 missing costs → 2 genuine stock gap → 3 opening balances → 4 next purchase
 * → 5 thin catalogue → 6 genuine supplier gaps → 7 unused catalogue cleanup
 * → 8 staff → 9 MoMo
 */
export function buildImproveRecordsCandidates(
  snapshot: ImproveRecordsSnapshot
): ImproveRecordsItem[] {
  if (!snapshot.onboardingComplete) return [];

  const items: ImproveRecordsItem[] = [];

  if (snapshot.missingCostProductCount > 0) {
    const n = snapshot.missingCostProductCount;
    const verb = n === 1 ? 'has' : 'have';
    items.push({
      key: 'missing-costs',
      title: 'Complete your product costs',
      explanation: `Profit is incomplete for ${n} product${n === 1 ? '' : 's'} that ${verb} been stocked or sold without a reliable cost.`,
      actionLabel: 'Review missing costs',
      href: IMPROVE_RECORDS_ISSUE_DEFS.MISSING_COST.href,
      priority: 100,
    });
  }

  if (snapshot.productsNeedingOpeningQtyCount > 0 && snapshot.saleCount > 0) {
    items.push({
      key: 'stock-completeness',
      title: 'Finish your stock records',
      explanation: stockGapExplanation(snapshot),
      actionLabel: 'Review stock gaps',
      href: IMPROVE_RECORDS_ISSUE_DEFS.STOCK_SETUP_GAP.href,
      priority: 90,
    });
  }

  if (openingBalancesNeedsAttention(snapshot.openingBalancesStatus) && snapshot.saleCount > 0) {
    const inProgress = snapshot.openingBalancesStatus === 'in_progress';
    items.push({
      key: 'opening-balances',
      title: inProgress ? 'Finish your starting balances' : 'Complete your starting balances',
      explanation:
        'Add what the business owned and owed when TillFlow started so the balance sheet is more reliable.',
      actionLabel: 'Review opening balances',
      href: '/settings#opening-capital',
      priority: 80,
    });
  }

  if (
    snapshot.purchaseCount === 0 &&
    (snapshot.saleCount >= 5 || snapshot.replenishmentWithoutPurchaseDetected)
  ) {
    items.push({
      key: 'purchases',
      title: 'Record your next stock delivery',
      explanation:
        'When new stock arrives, record the purchase so quantities, costs and supplier balances stay accurate.',
      actionLabel: 'Add a purchase',
      href: '/purchases#record-purchase-form',
      priority: snapshot.replenishmentWithoutPurchaseDetected ? 75 : 70,
    });
  }

  if (
    snapshot.saleCount >= 5 &&
    snapshot.validProductCount > 0 &&
    snapshot.validProductCount < 3 &&
    snapshot.missingCostProductCount === 0
  ) {
    items.push({
      key: 'catalogue',
      title: 'Grow your catalogue',
      explanation: `You have ${snapshot.validProductCount} product${snapshot.validProductCount === 1 ? '' : 's'} with a selling price. Add more as customers ask for them.`,
      actionLabel: 'Add a product',
      href: '/products/new',
      priority: 60,
    });
  }

  if (snapshot.purchasesNeedingSupplierCount > 0) {
    const n = snapshot.purchasesNeedingSupplierCount;
    items.push({
      key: 'suppliers',
      title: 'Link a supplier',
      explanation: supplierExplanation(n),
      actionLabel: 'Review purchases',
      href: IMPROVE_RECORDS_ISSUE_DEFS.MISSING_SUPPLIER.href,
      priority: 55,
    });
  }

  // Below genuine supplier gaps — large unused-catalogue counts must not outrank payables.
  if (snapshot.unusedCatalogueProductCount > 0 && snapshot.saleCount > 0) {
    const n = snapshot.unusedCatalogueProductCount;
    items.push({
      key: 'unused-catalogue',
      title: 'Review unused catalogue products',
      explanation: `${n} product${n === 1 ? ' has' : 's have'} never been stocked or sold. Confirm whether you still intend to carry ${n === 1 ? 'it' : 'them'}.`,
      actionLabel: 'Review catalogue',
      href: IMPROVE_RECORDS_ISSUE_DEFS.UNUSED_CATALOGUE.href,
      priority: 45,
    });
  }

  if (snapshot.pendingStaffInviteCount > 0 && snapshot.staffCount <= 1) {
    items.push({
      key: 'staff',
      title: 'Finish staff setup',
      explanation: 'An invitation is waiting. Finish adding the person who helps run the till.',
      actionLabel: 'Open team',
      href: '/users',
      priority: 40,
    });
  }

  if (
    (snapshot.momoEnabled || snapshot.momoActivityDetected) &&
    !hasMomoDetails(snapshot)
  ) {
    items.push({
      key: 'momo',
      title: 'Add MoMo details for receipts',
      explanation:
        'Cash already works at the till. Add your MoMo number so customers can see how to pay you.',
      actionLabel: 'Add MoMo details',
      href: '/settings#payments',
      priority: 30,
    });
  }

  return items
    .filter((item) => canAccess(item.key, snapshot.role))
    .sort((a, b) => b.priority - a.priority);
}

export function computeImproveRecords(
  snapshot: ImproveRecordsSnapshot
): ImproveRecordsResult {
  const candidates = buildImproveRecordsCandidates(snapshot);
  const primary = candidates[0] ?? null;
  const secondary = candidates.slice(1, 1 + MAX_SECONDARY);
  const allClear = primary === null;

  return {
    primary,
    secondary,
    allClear,
    allClearMessage: IMPROVE_RECORDS_ALL_CLEAR_MESSAGE,
  };
}

/** Keys that must never appear (billing/reports belong elsewhere). */
export const FORBIDDEN_IMPROVE_KEYS = ['billing', 'reports', 'view-reports', 'review-billing'] as const;

export {
  UNUSED_CATALOGUE_AGE_DAYS,
  PURCHASE_PAYABLE_STATUSES,
  OPENING_STOCK_MOVEMENT_TYPES,
  OPENING_STOCK_REFERENCE_TYPES,
} from '@/lib/improve-records-constants';
