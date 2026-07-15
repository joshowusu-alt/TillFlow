/**
 * Server-side signal loader for Improve Your Records.
 * Pure recommendation logic lives in improve-records.ts.
 *
 * Branch behaviour (documented):
 * Stock recommendations are **business-wide**. A product is treated as already
 * stocked if ANY store has an InventoryBalance row. Multi-branch: stocking at
 * any valid branch prevents “never stocked” classification. The UI does not
 * name a branch because the signal is business-scoped.
 */

import { prisma } from '@/lib/prisma';
import { getIncompleteStockSnapshot } from '@/lib/reports/incomplete-stock';
import { getBusinessPlan, type BusinessPlan } from '@/lib/features';
import { resolveOpeningBalancesStatus } from '@/lib/opening-balances-status';
import {
  UNUSED_CATALOGUE_AGE_DAYS,
  PURCHASE_PAYABLE_STATUSES,
  OPENING_STOCK_MOVEMENT_TYPES,
  OPENING_STOCK_REFERENCE_TYPES,
} from '@/lib/improve-records-constants';
import {
  classifyNoBalanceProduct,
  isOpeningStockMovement,
  purchaseNeedsSupplierLink,
} from '@/lib/improve-records-classify';
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

export type StockGapCounts = {
  productsNeedingOpeningQtyCount: number;
  soldWithoutConfirmedQtyCount: number;
  unusedCatalogueProductCount: number;
};

export type StockGapIdLists = StockGapCounts & {
  genuineGapProductIds: string[];
  soldWithoutConfirmedQtyIds: string[];
  unusedCatalogueProductIds: string[];
};

/**
 * Shared stock-gap classification: same IDs for Home counts and landing filters.
 * Classify active priced products with no InventoryBalance into genuine stock
 * gap vs aged unused catalogue. See classifyNoBalanceProduct for rules.
 */
export async function listStockGapSignals(
  businessId: string,
  now = new Date()
): Promise<StockGapIdLists> {
  const empty: StockGapIdLists = {
    productsNeedingOpeningQtyCount: 0,
    soldWithoutConfirmedQtyCount: 0,
    unusedCatalogueProductCount: 0,
    genuineGapProductIds: [],
    soldWithoutConfirmedQtyIds: [],
    unusedCatalogueProductIds: [],
  };

  const stores = await prisma.store.findMany({
    where: { businessId },
    select: { id: true },
  });
  const storeIds = stores.map((s) => s.id);

  const candidates = await prisma.product.findMany({
    where: {
      businessId,
      active: true,
      sellingPriceBasePence: { gt: 0 },
      inventoryBalances: { none: {} },
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  if (candidates.length === 0) return empty;

  const productIds = candidates.map((p) => p.id);

  const [soldProductRows, inboundHistoryRows, purchaseLineRows] = await Promise.all([
    prisma.salesInvoiceLine.findMany({
      where: {
        productId: { in: productIds },
        salesInvoice: {
          businessId,
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: { productId: true },
      distinct: ['productId'],
    }),
    storeIds.length === 0
      ? Promise.resolve([] as { productId: string }[])
      : prisma.stockMovement.findMany({
          where: {
            productId: { in: productIds },
            storeId: { in: storeIds },
            OR: [
              { type: { in: [...OPENING_STOCK_MOVEMENT_TYPES, 'PURCHASE', 'TRANSFER_IN'] } },
              {
                referenceType: {
                  in: [
                    ...OPENING_STOCK_REFERENCE_TYPES,
                    'PURCHASE_INVOICE',
                    'STOCK_ADJUSTMENT',
                    'STOCKTAKE',
                  ],
                },
              },
              { type: { in: ['ADJUSTMENT', 'ADJUSTMENT_IN', 'STOCKTAKE', 'STOCK_TAKE'] } },
            ],
          },
          select: { productId: true },
          distinct: ['productId'],
        }),
    prisma.purchaseInvoiceLine.findMany({
      where: {
        productId: { in: productIds },
        purchaseInvoice: { businessId },
      },
      select: { productId: true },
      distinct: ['productId'],
    }),
  ]);

  const soldIds = new Set(soldProductRows.map((r) => r.productId));
  const inboundIds = new Set(inboundHistoryRows.map((r) => r.productId));
  const purchasedIds = new Set(purchaseLineRows.map((r) => r.productId));

  const genuineGapProductIds: string[] = [];
  const soldWithoutConfirmedQtyIds: string[] = [];
  const unusedCatalogueProductIds: string[] = [];

  for (const product of candidates) {
    const hasSales = soldIds.has(product.id);
    const hasConfirmedQuantityHistory =
      inboundIds.has(product.id) || purchasedIds.has(product.id);
    const klass = classifyNoBalanceProduct(
      {
        createdAt: product.createdAt,
        hasSales,
        hasConfirmedQuantityHistory,
      },
      now
    );
    if (klass === 'genuine-gap') {
      genuineGapProductIds.push(product.id);
      if (hasSales) soldWithoutConfirmedQtyIds.push(product.id);
    } else if (klass === 'unused-catalogue') {
      unusedCatalogueProductIds.push(product.id);
    }
  }

  return {
    productsNeedingOpeningQtyCount: genuineGapProductIds.length,
    soldWithoutConfirmedQtyCount: soldWithoutConfirmedQtyIds.length,
    unusedCatalogueProductCount: unusedCatalogueProductIds.length,
    genuineGapProductIds,
    soldWithoutConfirmedQtyIds,
    unusedCatalogueProductIds,
  };
}

export async function countStockGapSignals(
  businessId: string,
  now = new Date()
): Promise<StockGapCounts> {
  const lists = await listStockGapSignals(businessId, now);
  return {
    productsNeedingOpeningQtyCount: lists.productsNeedingOpeningQtyCount,
    soldWithoutConfirmedQtyCount: lists.soldWithoutConfirmedQtyCount,
    unusedCatalogueProductCount: lists.unusedCatalogueProductCount,
  };
}

/** @deprecated Prefer countStockGapSignals */
export async function countProductsNeedingOpeningQty(businessId: string): Promise<number> {
  const counts = await countStockGapSignals(businessId);
  return counts.productsNeedingOpeningQtyCount;
}

/**
 * List genuine PURCHASE invoices that need a supplier for payable tracking.
 * Same rule as Home recommendation count — excludes opening-stock, void/cancel,
 * QA/demo, and paid-in-full cash.
 */
export async function listPurchasesNeedingSupplier(businessId: string): Promise<string[]> {
  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      businessId,
      supplierId: null,
      paymentStatus: { in: [...PURCHASE_PAYABLE_STATUSES] },
      OR: [{ qaTag: null }, { qaTag: { notIn: ['DEMO_DAY', 'QA', 'DEMO'] } }],
    },
    select: { id: true, paymentStatus: true, qaTag: true, supplierId: true },
    orderBy: { createdAt: 'desc' },
  });

  if (invoices.length === 0) return [];

  const invoiceIds = invoices.map((i) => i.id);
  const openingLinked = await prisma.stockMovement.findMany({
    where: {
      referenceId: { in: invoiceIds },
      OR: [
        { type: { in: [...OPENING_STOCK_MOVEMENT_TYPES] } },
        { referenceType: { in: [...OPENING_STOCK_REFERENCE_TYPES] } },
      ],
    },
    select: { referenceId: true, type: true, referenceType: true },
  });

  const openingIds = new Set<string>();
  for (const m of openingLinked) {
    if (m.referenceId && isOpeningStockMovement(m)) {
      openingIds.add(m.referenceId);
    }
  }

  return invoices
    .filter((inv) =>
      purchaseNeedsSupplierLink({
        supplierId: inv.supplierId,
        paymentStatus: inv.paymentStatus,
        qaTag: inv.qaTag,
        hasOpeningStockMovement: openingIds.has(inv.id),
      })
    )
    .map((inv) => inv.id);
}

export async function countPurchasesNeedingSupplier(businessId: string): Promise<number> {
  const ids = await listPurchasesNeedingSupplier(businessId);
  return ids.length;
}

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
    purchasesNeedingSupplierCount,
    momoPaymentCount,
    stockGaps,
    liveSaleCount,
  ] = await Promise.all([
    getIncompleteStockSnapshot(input.businessId),
    prisma.openingBalance.findMany({
      where: { businessId: input.businessId },
      select: { accountCode: true },
    }),
    prisma.purchaseInvoice.count({ where: { businessId: input.businessId } }),
    prisma.supplier.count({ where: { businessId: input.businessId } }),
    countPurchasesNeedingSupplier(input.businessId),
    prisma.salesPayment
      .count({
        where: {
          method: 'MOMO',
          salesInvoice: { businessId: input.businessId },
        },
      })
      .catch(() => 0),
    listStockGapSignals(input.businessId),
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
    productsNeedingOpeningQtyCount: stockGaps.productsNeedingOpeningQtyCount,
    soldWithoutConfirmedQtyCount: stockGaps.soldWithoutConfirmedQtyCount,
    unusedCatalogueProductCount: stockGaps.unusedCatalogueProductCount,
    stockValueIncomplete: incompleteStock.stockValueIncomplete,
    openingBalancesStatus,
    purchaseCount,
    replenishmentWithoutPurchaseDetected,
    supplierCount,
    purchasesNeedingSupplierCount,
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
    soldWithoutConfirmedQtyCount: 0,
    unusedCatalogueProductCount: 0,
    stockValueIncomplete: false,
    openingBalancesStatus: 'not_started',
    purchaseCount: 0,
    replenishmentWithoutPurchaseDetected: false,
    supplierCount: 0,
    purchasesNeedingSupplierCount: 0,
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

export { UNUSED_CATALOGUE_AGE_DAYS };
