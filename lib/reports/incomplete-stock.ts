/**
 * Detect incomplete stock valuation / profit for reporting and Improve Your Records.
 *
 * Missing cost covers:
 * - on-hand quantity with no positive average or default cost
 * - products sold (non-void/returned) without a positive stored sale-line cost
 *
 * Missing cost is never treated as zero profit intentionally — it means profit is incomplete.
 */

import { prisma } from '@/lib/prisma';

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

function productHasReliableCost(input: {
  defaultCostBasePence: number | null | undefined;
  avgCostBasePence?: number | null | undefined;
}): boolean {
  return (input.avgCostBasePence ?? 0) > 0 || (input.defaultCostBasePence ?? 0) > 0;
}

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
      soldWithoutCostProductIds: [],
      allMissingCostProductIds: [],
      missingCostProductCount: 0,
      stockValueIncomplete: false,
      profitMayBeIncomplete: false,
    };
  }

  const storeIds = stores.map((s) => s.id);

  const [balances, soldLines] = await Promise.all([
    prisma.inventoryBalance.findMany({
      where: {
        storeId: { in: storeIds },
        qtyOnHandBase: { gt: 0 },
      },
      select: {
        productId: true,
        qtyOnHandBase: true,
        avgCostBasePence: true,
        product: { select: { defaultCostBasePence: true, active: true } },
      },
    }),
    prisma.salesInvoiceLine.findMany({
      where: {
        lineCostPence: { lte: 0 },
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
    const hasCost = productHasReliableCost({
      defaultCostBasePence: row.product.defaultCostBasePence,
      avgCostBasePence: row.avgCostBasePence,
    });
    if (!hasCost) {
      costReviewProductIds.push(row.productId);
      unvaluedQtyBase += row.qtyOnHandBase;
    }
  }

  // Today's product or another branch's cost cannot establish historical COGS.
  // There is no persisted authority for an intentional zero cost yet, so zero
  // remains incomplete rather than being silently treated as a free product.
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
    return `Stock value and profit are incomplete — ${snapshot.productsWithUnvaluedQty} product(s) have quantity without a confirmed cost.`;
  }
  return `Profit may be incomplete — ${snapshot.missingCostProductCount} product(s) were sold without a reliable cost.`;
}
