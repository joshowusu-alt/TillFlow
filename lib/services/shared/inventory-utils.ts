/**
 * Shared inventory helpers used across services (sales, purchases, returns,
 * stock-adjustments).
 *
 * Centralises the repeated "fetch balances → build map → upsert" pattern.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/prisma';
import { isPostgresRuntimeEnv } from '@/lib/database-runtime';
import type { StockValue } from '@/lib/inventory-value';

// Prisma transaction clients are Omit<PrismaClient, connection methods>,
// so we widen the tx parameter to accept both.
type PrismaOrTx = PrismaClient | Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InventorySnapshot = {
  qtyOnHandBase: number;
  avgCostBasePence: number;
  knownValuePence?: number | null;
  unvaluedQtyBase?: number | null;
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
      { qtyOnHandBase: b.qtyOnHandBase, avgCostBasePence: b.avgCostBasePence,
        knownValuePence: b.knownValuePence, unvaluedQtyBase: b.unvaluedQtyBase }
    ])
  );
}

export async function lockInventoryValues(tx: any, storeId: string, productIds: string[]) {
  const ids = [...new Set(productIds)].sort();
  if (isPostgresRuntimeEnv(process.env) && typeof tx.$queryRaw === 'function') {
    if (ids.length > 0) await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtext(${storeId}), hashtext(p.id))::text AS locked
      FROM (SELECT unnest(ARRAY[${Prisma.join(ids)}]::text[]) AS id ORDER BY id) p
    `;
    if (ids.length > 0) await tx.$queryRaw`
      SELECT "id" FROM "InventoryBalance" WHERE "storeId" = ${storeId}
      AND "productId" IN (${Prisma.join(ids)}) ORDER BY "productId" FOR UPDATE
    `;
  }
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
  avgCostBasePence: number,
  value?: Pick<StockValue, 'knownValuePence' | 'unvaluedQtyBase'>
): Promise<void> {
  await tx.inventoryBalance.upsert({
    where: { storeId_productId: { storeId, productId } },
    update: { qtyOnHandBase, avgCostBasePence, knownValuePence: value?.knownValuePence ?? null, unvaluedQtyBase: value?.unvaluedQtyBase ?? null },
    create: { storeId, productId, qtyOnHandBase, avgCostBasePence, knownValuePence: value?.knownValuePence ?? null, unvaluedQtyBase: value?.unvaluedQtyBase ?? null }
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
  options?: { allowNegativeQuantity?: boolean },
): Promise<number> {
  const updated = await tx.inventoryBalance.update({
    where: { storeId_productId: { storeId, productId } },
    data: { qtyOnHandBase: { decrement: qtyBase }, knownValuePence: null, unvaluedQtyBase: null },
    select: { qtyOnHandBase: true },
  });
  if (!options?.allowNegativeQuantity && updated.qtyOnHandBase < 0) {
    throw new Error('Insufficient stock on hand');
  }
  return updated.qtyOnHandBase;
}

/**
 * Atomically decrement inventory balances for multiple products in a single
 * SQL statement. Collapses N round-trips into 1 regardless of cart size —
 * critical for large sales (30 items = 1 RTT instead of 30).
 * Throws if any resulting quantity would go negative (concurrent oversell guard).
 */
export async function batchDecrementInventoryBalance(
  tx: any,
  storeId: string,
  decrements: Map<string, number>, // productId -> qtyBase to subtract
  options?: { allowNegativeQuantity?: boolean; values?: Map<string, StockValue> },
): Promise<void> {
  if (decrements.size === 0) return;

  const entries = Array.from(decrements.entries());

  // Build a parameterized CASE expression:
  // CASE "productId" WHEN $1 THEN $2 WHEN $3 THEN $4 ... END
  const caseWhen = Prisma.join(
    entries.map(([productId, qty]) => Prisma.sql`WHEN ${productId} THEN ${qty}`),
    ' '
  );
  const productIdList = Prisma.join(entries.map(([id]) => id));
  const valueCases = Prisma.join(entries.map(([id]) => Prisma.sql`WHEN ${id} THEN ${options?.values?.get(id)?.knownValuePence ?? null}`), ' ');
  const unknownCases = Prisma.join(entries.map(([id]) => Prisma.sql`WHEN ${id} THEN ${options?.values?.get(id)?.unvaluedQtyBase ?? null}`), ' ');
  const avgCases = Prisma.join(entries.map(([id]) => Prisma.sql`WHEN ${id} THEN ${options?.values?.get(id)?.avgCostBasePence ?? null}`), ' ');

  const result = await tx.$queryRaw<{ productId: string; qtyOnHandBase: number }[]>`
    UPDATE "InventoryBalance"
    SET "qtyOnHandBase" = "qtyOnHandBase" - CASE "productId" ${caseWhen} END,
        "knownValuePence" = CAST(CASE "productId" ${valueCases} END AS INTEGER),
        "unvaluedQtyBase" = CAST(CASE "productId" ${unknownCases} END AS INTEGER),
        "avgCostBasePence" = COALESCE(CAST(CASE "productId" ${avgCases} END AS INTEGER), "avgCostBasePence")
    WHERE "storeId" = ${storeId}
      AND "productId" IN (${productIdList})
    RETURNING "productId", "qtyOnHandBase"
  `;

  for (const row of result) {
    if (!options?.allowNegativeQuantity && row.qtyOnHandBase < 0) {
      throw new Error('Insufficient stock on hand');
    }
  }

  if (result.length !== decrements.size) {
    throw new Error('One or more product inventory records not found');
  }
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
      knownValuePence: null, unvaluedQtyBase: null,
    },
    create: { storeId, productId, qtyOnHandBase: qtyBase, avgCostBasePence: newAvgCostBasePence },
  });
}

/**
 * Atomically increment on-hand quantity only. Leaves avgCostBasePence untouched.
 * Requires the InventoryBalance row to already exist (Phase 2 increase path).
 */
export async function incrementInventoryBalanceQtyOnly(
  tx: any,
  storeId: string,
  productId: string,
  qtyBase: number,
): Promise<number> {
  const updated = await tx.inventoryBalance.update({
    where: { storeId_productId: { storeId, productId } },
    data: { qtyOnHandBase: { increment: qtyBase }, knownValuePence: null, unvaluedQtyBase: null },
    select: { qtyOnHandBase: true },
  });
  return updated.qtyOnHandBase as number;
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
