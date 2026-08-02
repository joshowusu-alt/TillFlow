'use server';

import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { formString, formInt } from '@/lib/form-helpers';
import { withBusinessStoreContext, formAction, UserError } from '@/lib/action-utils';
import { checkAndSendLowStockAlert } from '@/app/actions/stock-alerts';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';
import { isInventoryDecreasePhase1Enabled } from '@/lib/inventory-decrease-flag';
import {
  createInventoryDecrease,
  InventoryDecreaseError,
  isInventoryDecreaseReasonCode,
} from '@/lib/services/inventory-decrease';

function mapDecreaseError(error: unknown): never {
  if (error instanceof InventoryDecreaseError) {
    throw new UserError(error.message);
  }
  throw error;
}

/**
 * Phase 1 quantity-decrease only. Does not call legacy createStockAdjustment.
 * Authoritative audit is written inside the decrease service transaction.
 */
export async function createStockAdjustmentAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    if (!isInventoryDecreasePhase1Enabled()) {
      throw new UserError('Inventory adjustments are temporarily unavailable.');
    }

    const { user, businessId, storeId: defaultStoreId } =
      await withBusinessStoreContext(['MANAGER', 'OWNER']);

    const storeId = formString(formData, 'storeId') || defaultStoreId;
    const productId = formString(formData, 'productId');
    const unitId = formString(formData, 'unitId');
    const qtyInUnit = formInt(formData, 'qtyInUnit');
    const direction = (formString(formData, 'direction') || 'DECREASE').toUpperCase();
    const reasonCodeRaw = formString(formData, 'reasonCode');
    const reason = formString(formData, 'reason') || '';
    const idempotencyKey = formString(formData, 'idempotencyKey');

    if (direction !== 'DECREASE') {
      throw new UserError('Only quantity decreases are supported.');
    }
    if (!isInventoryDecreaseReasonCode(reasonCodeRaw)) {
      throw new UserError('Select a valid adjustment reason code.');
    }
    if (!idempotencyKey) {
      throw new UserError('Missing idempotency key. Refresh and try again.');
    }

    let adjustment;
    try {
      adjustment = await createInventoryDecrease({
        businessId,
        storeId,
        productId,
        unitId,
        qtyInUnit,
        reasonCode: reasonCodeRaw,
        reason,
        idempotencyKey,
        userId: user.id,
        userName: user.name ?? 'Unknown',
        userRole: user.role,
      });
    } catch (error) {
      mapDecreaseError(error);
    }

    void checkAndSendLowStockAlert({
      businessId,
      storeId,
      productIds: [adjustment.productId],
    }).catch(() => {});

    revalidateTag('pos-products');
    revalidateTag('reports');
    revalidateOwnerDashboardCache();
    const { revalidateImproveRecordsHome } = await import('@/lib/improve-records-revalidate');
    revalidateImproveRecordsHome();

    redirect('/inventory/adjustments');
  }, '/inventory/adjustments');
}

/**
 * Automated reversal is unavailable in Phase 1 (increases deferred; payload-safe
 * compensating entries are a later design).
 */
export async function reverseStockAdjustmentAction(_formData: FormData): Promise<void> {
  return formAction(async () => {
    await withBusinessStoreContext(['OWNER']);
    throw new UserError(
      'Automated adjustment reversal is unavailable. Phase 1 supports decreases only.',
    );
  }, '/inventory/adjustments');
}
