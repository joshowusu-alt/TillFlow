/**
 * Shared inventory helpers used across services (sales, purchases, returns,
 * stock-adjustments).
 *
 * Centralises the repeated "fetch balances → build map → upsert" pattern.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/prisma';

// Prisma transaction clients are Omit<PrismaClient, connection methods>,
// so we widen the tx parameter to accept both.
type PrismaOrTx = PrismaClient | Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

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
  tx?: PrismaOrTx
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
 * Atomically decrement inventory balance inside a transaction.
 * Uses Prisma's `decrement` to avoid read-modify-write race conditions.
 * Throws if the resulting quantity would be negative.
 */
export async function decrementInventoryBalance(
  tx: any,
  storeId: string,
  productId: string,
  qtyBase: number,
): Promise<number> {
  const updated = await tx.inventoryBalance.update({
    where: { storeId_productId: { storeId, productId } },
    data: { qtyOnHandBase: { decrement: qtyBase } },
    select: { qtyOnHandBase: true },
  });
  if (updated.qtyOnHandBase < 0) {
    throw new Error('Insufficient stock on hand');
  }
  return updated.qtyOnHandBase;
}

/**
 * Atomically increment inventory balance inside a transaction.
 * Uses Prisma's `increment` to avoid read-modify-write race conditions.
 */
export async function incrementInventoryBalance(
  tx: any,
  storeId: string,
  productId: string,
  qtyBase: number,
  newAvgCostBasePence: number,
): Promise<void> {
  await tx.inventoryBalance.upsert({
    where: { storeId_productId: { storeId, productId } },
    update: {
      qtyOnHandBase: { increment: qtyBase },
      avgCostBasePence: newAvgCostBasePence,
    },
    create: { storeId, productId, qtyOnHandBase: qtyBase, avgCostBasePence: newAvgCostBasePence },
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
