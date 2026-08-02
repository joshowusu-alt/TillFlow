import { Prisma } from '@prisma/client';
import { InventoryDecreaseError, INVENTORY_DECREASE_ERROR } from './inventory-decrease';

/**
 * Legacy unhardened stock adjustment — permanently disabled.
 * Callers must use `createInventoryDecrease` (Phase 1 decrease-only path).
 */
export async function createStockAdjustment(
  _input: {
    businessId: string;
    storeId: string;
    productId: string;
    unitId: string;
    qtyInUnit: number;
    direction: 'INCREASE' | 'DECREASE';
    reason?: string | null;
    userId: string;
  },
  _tx?: Prisma.TransactionClient,
): Promise<never> {
  throw new InventoryDecreaseError(
    INVENTORY_DECREASE_ERROR.INVALID_ADJUSTMENT,
    'Legacy stock adjustments are disabled. Use Phase 1 inventory decrease.',
  );
}
