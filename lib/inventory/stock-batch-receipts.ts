import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { UserError } from '@/lib/action-utils';
import { readBatchDates } from '@/lib/inventory/batch-dates';

export const STOCK_BATCH_SOURCES = ['PURCHASE', 'OPENING_STOCK', 'IMPORT', 'FOOD_UNDO'] as const;
export type StockBatchSource = (typeof STOCK_BATCH_SOURCES)[number];

export type StockBatchReceiptDraft = {
  id?: string;
  businessId: string;
  storeId: string;
  productId: string;
  qtyReceivedBase: number;
  productionDate?: Date | null;
  expiryDate?: Date | null;
  source: StockBatchSource;
  purchaseLineId?: string | null;
  openingReferenceId?: string | null;
};

type BatchWriter = {
  stockBatch: {
    createMany: (args: { data: Prisma.StockBatchCreateManyInput[] }) => Promise<unknown>;
  };
};

export function assertBatchDates(productionDate: Date | null | undefined, expiryDate: Date | null | undefined) {
  const result = readBatchDates(productionDate ?? null, expiryDate ?? null);
  if (!result.ok) throw new UserError(result.message);
  return result.dates;
}

/**
 * Record receipt batches for a delivery that is already being saved.
 * Does not change on-hand quantity or ledger postings.
 * Skips zero quantities. Callers must not use this to backfill old stock.
 */
export async function createStockBatchReceipts(client: BatchWriter, drafts: StockBatchReceiptDraft[]) {
  const data = drafts
    .filter((draft) => draft.qtyReceivedBase > 0)
    .map((draft) => {
      const dates = assertBatchDates(draft.productionDate, draft.expiryDate);
      return {
        id: draft.id ?? randomUUID(),
        businessId: draft.businessId,
        storeId: draft.storeId,
        productId: draft.productId,
        qtyReceivedBase: Math.floor(draft.qtyReceivedBase),
        productionDate: dates.productionDate,
        expiryDate: dates.expiryDate,
        source: draft.source,
        purchaseLineId: draft.purchaseLineId ?? null,
        openingReferenceId: draft.openingReferenceId ?? null,
      };
    });
  if (data.length === 0) return;
  await client.stockBatch.createMany({ data });
}
