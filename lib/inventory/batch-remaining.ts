/**
 * Estimate how much of each receipt is still on hand.
 *
 * InventoryBalance.qtyOnHandBase is the stock truth. StockBatch rows only
 * record what was received after expiry tracking started. This function does
 * not change stock, sales, or accounting, and it does not invent batches for
 * quantity that has no receipt record.
 *
 * Rule, applied per branch and product:
 * 1. Sort receipts newest first (createdAt descending, then id descending).
 * 2. Give the current on-hand to those newest receipts until the on-hand is used up.
 * 3. Older receipts — usually the earlier-expiring ones — are assumed sold first
 *    and get an estimated remaining of 0 once newer receipts explain the on-hand.
 * 4. Cap the total estimate at on-hand. Negative on-hand is treated as zero.
 * 5. On-hand above the sum of recorded receipts stays untracked and is left
 *    out of expiry reporting.
 */

export type BatchReceiptForAllocation = {
  id: string;
  storeId: string;
  productId: string;
  qtyReceivedBase: number;
  createdAt: Date;
};

export type OnHandForAllocation = {
  storeId: string;
  productId: string;
  qtyOnHandBase: number;
};

export type BatchAllocation = {
  remainingByBatchId: Map<string, number>;
  /** On-hand that no receipt explains. Never assigned to a made-up batch. */
  untrackedOnHandByProduct: Map<string, number>;
};

function productKey(storeId: string, productId: string) {
  return `${storeId}\u0000${productId}`;
}

function newestFirst(a: BatchReceiptForAllocation, b: BatchReceiptForAllocation) {
  const time = b.createdAt.getTime() - a.createdAt.getTime();
  if (time !== 0) return time;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

export function allocateBatchRemaining(
  batches: BatchReceiptForAllocation[],
  onHand: OnHandForAllocation[],
): BatchAllocation {
  const remainingByBatchId = new Map<string, number>();
  const grouped = new Map<string, BatchReceiptForAllocation[]>();
  for (const batch of batches) {
    remainingByBatchId.set(batch.id, 0);
    const key = productKey(batch.storeId, batch.productId);
    const list = grouped.get(key) ?? [];
    list.push(batch);
    grouped.set(key, list);
  }

  const onHandByProduct = new Map<string, number>();
  for (const row of onHand) {
    const key = productKey(row.storeId, row.productId);
    const qty = Number.isFinite(row.qtyOnHandBase) ? Math.max(0, Math.floor(row.qtyOnHandBase)) : 0;
    onHandByProduct.set(key, (onHandByProduct.get(key) ?? 0) + qty);
  }

  const untrackedOnHandByProduct = new Map<string, number>();
  for (const [key, receipts] of grouped) {
    let left = onHandByProduct.get(key) ?? 0;
    onHandByProduct.delete(key);
    for (const receipt of [...receipts].sort(newestFirst)) {
      const received = Number.isFinite(receipt.qtyReceivedBase) ? Math.max(0, Math.floor(receipt.qtyReceivedBase)) : 0;
      const estimated = Math.min(received, left);
      remainingByBatchId.set(receipt.id, estimated);
      left -= estimated;
    }
    if (left > 0) untrackedOnHandByProduct.set(key, left);
  }

  return { remainingByBatchId, untrackedOnHandByProduct };
}
