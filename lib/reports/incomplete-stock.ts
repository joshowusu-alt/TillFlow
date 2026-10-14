/**
 * Detect incomplete stock valuation / profit for reporting and Improve Your Records.
 *
 * Missing cost covers:
 * - on-hand quantity with no positive average or default cost
 * - products sold (non-void/returned) without a positive stored sale-line cost
 *
 * Missing cost is never treated as zero profit intentionally — it means profit is incomplete.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { INVENTORY_VALUE_V1, UNVERIFIED_STOCK_V1 } from '@/lib/inventory-value';

export type IncompleteStockSnapshot = {
  productsWithUnvaluedQty: number;
  unvaluedQtyBase: number;
  /** Products with on-hand qty and no reliable cost. */
  costReviewProductIds: string[];
  /** Products sold without positive stored line-cost evidence, regardless of current costs. */
  soldWithoutCostProductIds: string[];
  /** Union of stocked + sold missing-cost product IDs (for filtered product review). */
  allMissingCostProductIds: string[];
  /** Unique count across stocked + sold missing-cost products. */
  missingCostProductCount: number;
  stockValueIncomplete: boolean;
  profitMayBeIncomplete: boolean;
};

export async function getIncompleteStockSnapshot(businessId: string, db: Prisma.TransactionClient = prisma): Promise<IncompleteStockSnapshot> {
  const stores = await db.store.findMany({
    where: { businessId },
    select: { id: true },
  });
  if (stores.length === 0) {
    return {
      productsWithUnvaluedQty: 0,
      unvaluedQtyBase: 0,
      costReviewProductIds: [],
      soldWithoutCostProductIds: [],
      allMissingCostProductIds: [],
      missingCostProductCount: 0,
      stockValueIncomplete: false,
      profitMayBeIncomplete: false,
    };
  }

  const storeIds = stores.map((s) => s.id);

  const [balances, soldLines] = await Promise.all([
    db.inventoryBalance.findMany({
      where: {
        storeId: { in: storeIds },
        qtyOnHandBase: { gt: 0 },
      },
      select: {
        productId: true,
        qtyOnHandBase: true,
        avgCostBasePence: true,
        knownValuePence: true,
        unvaluedQtyBase: true,
        product: { select: { defaultCostBasePence: true, active: true } },
      },
    }),
    db.salesInvoiceLine.findMany({
      where: {
        OR: [
          { costBasis: UNVERIFIED_STOCK_V1 },
          { lineCostPence: { lte: 0 }, OR: [{ costBasis: null }, { costBasis: { not: INVENTORY_VALUE_V1 } }] },
        ],
        salesInvoice: {
          businessId,
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: {
        productId: true,
      },
      distinct: ['productId'],
    }),
  ]);

  const costReviewProductIds: string[] = [];
  let unvaluedQtyBase = 0;
  for (const row of balances) {
    const hasCost = row.knownValuePence != null && row.unvaluedQtyBase === 0;
    if (!hasCost) {
      costReviewProductIds.push(row.productId);
      unvaluedQtyBase += row.knownValuePence != null && row.unvaluedQtyBase != null ? row.unvaluedQtyBase : row.qtyOnHandBase;
    }
  }

  // Today's product or another branch's cost cannot establish historical COGS.
  // Exact-value allocations can legitimately round to zero; their persisted
  // authority distinguishes them from unknown costs.
  const soldWithoutCostProductIds = soldLines.map((line) => line.productId);

  const uniqueStocked = [...new Set(costReviewProductIds)];
  const uniqueSold = [...new Set(soldWithoutCostProductIds)];
  const allMissingCostProductIds = [...new Set([...uniqueStocked, ...uniqueSold])];
  const incomplete = allMissingCostProductIds.length > 0;

  return {
    productsWithUnvaluedQty: uniqueStocked.length,
    unvaluedQtyBase,
    costReviewProductIds: uniqueStocked,
    soldWithoutCostProductIds: uniqueSold,
    allMissingCostProductIds,
    missingCostProductCount: allMissingCostProductIds.length,
    stockValueIncomplete: uniqueStocked.length > 0,
    profitMayBeIncomplete: incomplete,
  };
}

export function incompleteStockDisclosureMessage(snapshot: IncompleteStockSnapshot): string | null {
  if (!snapshot.profitMayBeIncomplete) return null;
  if (snapshot.stockValueIncomplete) {
    return `Stock value is incomplete — ${snapshot.productsWithUnvaluedQty} product(s) need confirmed stock value. Sales can continue; profit for sales without confirmed cost is incomplete.`;
  }
  return `Profit may be incomplete — ${snapshot.missingCostProductCount} product(s) were sold without a reliable cost.`;
}
