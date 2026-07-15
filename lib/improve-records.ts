/**
 * Improve Your Records — Phase 2 recommendation engine.
 * Outcome-based coaching after first sale. Never blocks selling.
 * Urgent operational items belong in Command Center / Today focus — not here.
 */

import type { OpeningBalancesStatus } from '@/lib/opening-balances-status';
import { openingBalancesNeedsAttention } from '@/lib/opening-balances-status';

export type ImproveRecordsRole = 'OWNER' | 'MANAGER' | 'CASHIER';
export type ImproveRecordsPlan = 'STARTER' | 'GROWTH' | 'PRO';

export type ImproveRecordsItemKey =
  | 'missing-costs'
  | 'stock-completeness'
  | 'opening-balances'
  | 'purchases'
  | 'catalogue'
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
   * Active priced products with no inventory balance row yet
   * (opening quantity never entered). Excludes OOS-after-setup.
   */
  productsNeedingOpeningQtyCount: number;
  stockValueIncomplete: boolean;
  openingBalancesStatus: OpeningBalancesStatus;
  purchaseCount: number;
  /** Stock increased via non-opening movements without matching purchases. */
  replenishmentWithoutPurchaseDetected: boolean;
  supplierCount: number;
  purchasesWithoutSupplierCount: number;
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

/**
 * Build candidate improvements from real outcomes. Order follows the approved
 * priority ladder; callers take the first eligible as primary.
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
      href: '/products?missingCost=1',
      priority: 100,
    });
  }

  if (snapshot.productsNeedingOpeningQtyCount > 0 && snapshot.saleCount > 0) {
    const n = snapshot.productsNeedingOpeningQtyCount;
    items.push({
      key: 'stock-completeness',
      title: 'Finish your stock records',
      explanation: `${n} active product${n === 1 ? '' : 's'} still need${n === 1 ? 's' : ''} an opening quantity.`,
      actionLabel: 'Continue opening stock',
      href: '/settings/import-stock?mode=OPENING_STOCK',
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
      href: '/purchases',
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

  if (
    snapshot.purchaseCount > 0 &&
    (snapshot.supplierCount === 0 || snapshot.purchasesWithoutSupplierCount > 0)
  ) {
    const missing = snapshot.purchasesWithoutSupplierCount;
    items.push({
      key: 'suppliers',
      title: 'Link your suppliers',
      explanation:
        missing > 0
          ? `${missing} purchase${missing === 1 ? '' : 's'} need${missing === 1 ? 's' : ''} a supplier so payables stay clear.`
          : 'Purchases are recorded. Add suppliers so debts and deliveries are easier to track.',
      actionLabel: 'Manage suppliers',
      href: '/suppliers',
      priority: 50,
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
