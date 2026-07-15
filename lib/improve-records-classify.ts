/**
 * Pure stock-gap classification for Improve Your Records.
 * Loader applies these rules after loading DB signals.
 */

import { UNUSED_CATALOGUE_AGE_DAYS } from '@/lib/improve-records-constants';

export type NoBalanceProductSignals = {
  createdAt: Date;
  hasSales: boolean;
  /** Opening, purchase, transfer-in, adjustment, or stocktake history. */
  hasConfirmedQuantityHistory: boolean;
};

export type StockGapClass = 'exclude' | 'genuine-gap' | 'unused-catalogue';

export function catalogueCutoffDate(
  now = new Date(),
  ageDays = UNUSED_CATALOGUE_AGE_DAYS
): Date {
  return new Date(now.getTime() - ageDays * 24 * 60 * 60 * 1000);
}

/**
 * Classify an active priced product that has no InventoryBalance row.
 * Business-wide: callers must only pass products with no balance on any branch.
 */
export function classifyNoBalanceProduct(
  signals: NoBalanceProductSignals,
  now = new Date(),
  ageDays = UNUSED_CATALOGUE_AGE_DAYS
): StockGapClass {
  if (signals.hasConfirmedQuantityHistory) return 'exclude';

  const cutoff = catalogueCutoffDate(now, ageDays);
  const isRecent = signals.createdAt >= cutoff;

  if (signals.hasSales || isRecent) return 'genuine-gap';
  return 'unused-catalogue';
}

export function isPurchasePayableStatus(status: string): boolean {
  return status === 'UNPAID' || status === 'PARTIAL' || status === 'PART_PAID';
}

export function isOpeningStockMovement(input: {
  type?: string | null;
  referenceType?: string | null;
}): boolean {
  if (input.type === 'OPENING') return true;
  return (
    input.referenceType === 'OPENING_STOCK' ||
    input.referenceType === 'OPENING_BALANCE_INVENTORY'
  );
}

/**
 * Whether a null-supplier invoice should trigger supplier coaching.
 */
export function purchaseNeedsSupplierLink(input: {
  supplierId: string | null;
  paymentStatus: string;
  qaTag?: string | null;
  hasOpeningStockMovement: boolean;
}): boolean {
  if (input.supplierId) return false;
  if (input.hasOpeningStockMovement) return false;
  if (['VOID', 'CANCELLED', 'RETURNED'].includes(input.paymentStatus)) return false;
  if (input.qaTag && ['DEMO_DAY', 'QA', 'DEMO'].includes(input.qaTag)) return false;
  return isPurchasePayableStatus(input.paymentStatus);
}
