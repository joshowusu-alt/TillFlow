/**
 * Detect incomplete stock valuation / profit for reporting disclosures.
 * Incomplete = on-hand quantity with no positive average or default cost.
 */

import { prisma } from '@/lib/prisma';

export type IncompleteStockSnapshot = {
  productsWithUnvaluedQty: number;
  unvaluedQtyBase: number;
  costReviewProductIds: string[];
  stockValueIncomplete: boolean;
  profitMayBeIncomplete: boolean;
};

export async function getIncompleteStockSnapshot(businessId: string): Promise<IncompleteStockSnapshot> {
  const stores = await prisma.store.findMany({
    where: { businessId },
    select: { id: true },
  });
  if (stores.length === 0) {
    return {
      productsWithUnvaluedQty: 0,
      unvaluedQtyBase: 0,
      costReviewProductIds: [],
      stockValueIncomplete: false,
      profitMayBeIncomplete: false,
    };
  }

  const balances = await prisma.inventoryBalance.findMany({
    where: {
      storeId: { in: stores.map((s) => s.id) },
      qtyOnHandBase: { gt: 0 },
    },
    select: {
      productId: true,
      qtyOnHandBase: true,
      avgCostBasePence: true,
      product: { select: { defaultCostBasePence: true } },
    },
  });

  const costReviewProductIds: string[] = [];
  let unvaluedQtyBase = 0;
  for (const row of balances) {
    const hasCost =
      (row.avgCostBasePence ?? 0) > 0 || (row.product.defaultCostBasePence ?? 0) > 0;
    if (!hasCost) {
      costReviewProductIds.push(row.productId);
      unvaluedQtyBase += row.qtyOnHandBase;
    }
  }

  const uniqueIds = [...new Set(costReviewProductIds)];
  const incomplete = uniqueIds.length > 0;

  return {
    productsWithUnvaluedQty: uniqueIds.length,
    unvaluedQtyBase,
    costReviewProductIds: uniqueIds,
    stockValueIncomplete: incomplete,
    profitMayBeIncomplete: incomplete,
  };
}

export function incompleteStockDisclosureMessage(snapshot: IncompleteStockSnapshot): string | null {
  if (!snapshot.stockValueIncomplete) return null;
  return `Stock value and profit are incomplete — ${snapshot.productsWithUnvaluedQty} product(s) have quantity without a confirmed cost.`;
}
