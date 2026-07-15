/**
 * Server-side signal loader for Improve Your Records.
 * Pure recommendation logic lives in improve-records.ts.
 */

import { prisma } from '@/lib/prisma';
import { getIncompleteStockSnapshot } from '@/lib/reports/incomplete-stock';
import { getBusinessPlan, type BusinessPlan } from '@/lib/features';
import {
  resolveOpeningBalancesStatus,
} from '@/lib/opening-balances-status';
import {
  computeImproveRecords,
  type ImproveRecordsResult,
  type ImproveRecordsRole,
  type ImproveRecordsPlan,
  type ImproveRecordsSnapshot,
} from '@/lib/improve-records';

type LoadInput = {
  businessId: string;
  onboardingComplete: boolean;
  saleCount: number;
  productCount: number;
  validProductCount: number;
  sellableProductCount: number;
  staffCount: number;
  momoEnabled: boolean;
  momoNumber: string | null;
  momoProvider: string | null;
  planOrMode?: string | null;
  storeMode?: string | null;
  role: ImproveRecordsRole;
};

/**
 * Active priced products with no inventory balance row = opening qty never entered.
 * Excludes inactive, unpriced, and products that already have a balance (incl. qty 0 / OOS).
 */
export async function countProductsNeedingOpeningQty(businessId: string): Promise<number> {
  return prisma.product.count({
    where: {
      businessId,
      active: true,
      sellingPriceBasePence: { gt: 0 },
      inventoryBalances: { none: {} },
    },
  });
}

/**
 * Detect stock replenishment activity without purchase invoices
 * (e.g. PURCHASE/ADJUSTMENT_IN/TRANSFER_IN movements while purchaseCount is 0).
 */
export async function detectReplenishmentWithoutPurchase(
  businessId: string,
  purchaseCount: number
): Promise<boolean> {
  if (purchaseCount > 0) return false;
  const stores = await prisma.store.findMany({
    where: { businessId },
    select: { id: true },
  });
  if (stores.length === 0) return false;

  const inbound = await prisma.stockMovement.count({
    where: {
      storeId: { in: stores.map((s) => s.id) },
      qtyBase: { gt: 0 },
      type: { in: ['PURCHASE', 'TRANSFER_IN'] },
    },
  });
  return inbound > 0;
}

export async function loadImproveRecordsSnapshot(
  input: LoadInput
): Promise<ImproveRecordsSnapshot> {
  const [
    incompleteStock,
    openingBalanceRows,
    purchaseCount,
    supplierCount,
    purchasesWithoutSupplierCount,
    momoPaymentCount,
    productsNeedingOpeningQtyCount,
    liveSaleCount,
  ] = await Promise.all([
    getIncompleteStockSnapshot(input.businessId),
    prisma.openingBalance.findMany({
      where: { businessId: input.businessId },
      select: { accountCode: true },
    }),
    prisma.purchaseInvoice.count({ where: { businessId: input.businessId } }),
    prisma.supplier.count({ where: { businessId: input.businessId } }),
    prisma.purchaseInvoice.count({
      where: { businessId: input.businessId, supplierId: null },
    }),
    prisma.salesPayment
      .count({
        where: {
          method: 'MOMO',
          salesInvoice: { businessId: input.businessId },
        },
      })
      .catch(() => 0),
    countProductsNeedingOpeningQty(input.businessId),
    // Prefer live sale count over possibly stale activation snapshot.
    prisma.salesInvoice.count({
      where: {
        businessId: input.businessId,
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
      },
    }),
  ]);

  const replenishmentWithoutPurchaseDetected = await detectReplenishmentWithoutPurchase(
    input.businessId,
    purchaseCount
  );

  const openingBalancesStatus = resolveOpeningBalancesStatus(openingBalanceRows);
  const saleCount = Math.max(input.saleCount, liveSaleCount);

  const plan = getBusinessPlan(
    input.planOrMode as BusinessPlan | null | undefined,
    input.storeMode as 'SINGLE_STORE' | 'MULTI_STORE' | null | undefined
  );

  return {
    onboardingComplete: input.onboardingComplete,
    saleCount,
    productCount: input.productCount,
    validProductCount: input.validProductCount,
    sellableProductCount: input.sellableProductCount,
    missingCostProductCount: incompleteStock.missingCostProductCount,
    productsNeedingOpeningQtyCount,
    stockValueIncomplete: incompleteStock.stockValueIncomplete,
    openingBalancesStatus,
    purchaseCount,
    replenishmentWithoutPurchaseDetected,
    supplierCount,
    purchasesWithoutSupplierCount,
    staffCount: input.staffCount,
    pendingStaffInviteCount: 0,
    momoEnabled: input.momoEnabled,
    momoNumber: input.momoNumber,
    momoProvider: input.momoProvider,
    momoActivityDetected: momoPaymentCount > 0,
    role: input.role,
    plan,
  };
}

function emptySnapshot(
  role: ImproveRecordsRole,
  plan: ImproveRecordsPlan = 'STARTER'
): ImproveRecordsSnapshot {
  return {
    onboardingComplete: false,
    saleCount: 0,
    productCount: 0,
    validProductCount: 0,
    sellableProductCount: 0,
    missingCostProductCount: 0,
    productsNeedingOpeningQtyCount: 0,
    stockValueIncomplete: false,
    openingBalancesStatus: 'not_started',
    purchaseCount: 0,
    replenishmentWithoutPurchaseDetected: false,
    supplierCount: 0,
    purchasesWithoutSupplierCount: 0,
    staffCount: 1,
    pendingStaffInviteCount: 0,
    momoEnabled: false,
    momoNumber: null,
    momoProvider: null,
    momoActivityDetected: false,
    role,
    plan,
  };
}

export async function loadImproveRecordsResult(
  input: LoadInput
): Promise<ImproveRecordsResult> {
  if (!input.onboardingComplete) {
    return computeImproveRecords(emptySnapshot(input.role));
  }

  const snapshot = await loadImproveRecordsSnapshot(input);
  return computeImproveRecords(snapshot);
}
