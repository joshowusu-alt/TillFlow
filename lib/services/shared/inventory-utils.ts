/**
 * Shared inventory helpers used across services (sales, purchases, returns,
 * stock-adjustments).
 *
 * Centralises the repeated "fetch balances → build map → upsert" pattern.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InventorySnapshot = {
  qtyOnHandBase: number;
  avgCostBasePence: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch inventory balances for a set of products in a store and return them
 * as a Map keyed by productId.
 */
export async function fetchInventoryMap(
  storeId: string,
  productIds: string[],
  tx?: PrismaClient
): Promise<Map<string, InventorySnapshot>> {
  const client = tx ?? defaultPrisma;
  const balances = await (client as any).inventoryBalance.findMany({
    where: { storeId, productId: { in: productIds } }
  });
  return new Map(
    balances.map((b: any) => [
      b.productId,
      { qtyOnHandBase: b.qtyOnHandBase, avgCostBasePence: b.avgCostBasePence }
    ])
  );
}

/**
 * Resolve the average cost for a product: prefer the inventory balance's
 * `avgCostBasePence` (if positive), otherwise fall back to the product's
 * `defaultCostBasePence`.
 */
export function resolveAvgCost(
  inventoryMap: Map<string, InventorySnapshot>,
  productId: string,
  defaultCostBasePence: number
): number {
  const inv = inventoryMap.get(productId);
  return inv?.avgCostBasePence && inv.avgCostBasePence > 0
    ? inv.avgCostBasePence
    : defaultCostBasePence;
}

/**
 * Upsert an inventory balance inside a transaction.
 */
export async function upsertInventoryBalance(
  tx: any,
  storeId: string,
  productId: string,
  qtyOnHandBase: number,
  avgCostBasePence: number
): Promise<void> {
  await tx.inventoryBalance.upsert({
    where: { storeId_productId: { storeId, productId } },
    update: { qtyOnHandBase, avgCostBasePence },
    create: { storeId, productId, qtyOnHandBase, avgCostBasePence }
  });
}

/**
 * Build a qty-per-product map from invoice lines.
 */
export function buildQtyByProductMap(
  lines: { productId: string; qtyBase: number }[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    map.set(line.productId, (map.get(line.productId) ?? 0) + line.qtyBase);
  }
  return map;
}
