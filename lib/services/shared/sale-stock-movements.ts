import type { Prisma } from '@prisma/client';

/** A sale's invoice, balances, movements and journals must commit together. */
export async function recordSaleStockMovements(
  tx: Prisma.TransactionClient,
  data: Prisma.StockMovementCreateManyInput[],
  inventory: ReadonlyMap<string, { qtyOnHandBase: number }>,
) {
  if (!data.length) return;
  const quantities = new Map<string, number>();
  const movements = data.map(row => {
    const beforeQtyBase = quantities.get(row.productId)
      ?? inventory.get(row.productId)?.qtyOnHandBase ?? 0;
    const afterQtyBase = beforeQtyBase + row.qtyBase;
    quantities.set(row.productId, afterQtyBase);
    return { ...row, beforeQtyBase, afterQtyBase };
  });
  const result = await tx.stockMovement.createMany({ data: movements });
  if (result.count !== movements.length) {
    // Throw inside the caller's transaction: a partial movement batch cannot
    // leave an invoice, payment, journal or quantity change committed alone.
    throw new Error('Unable to record all sale stock movements. Please try again.');
  }
}
