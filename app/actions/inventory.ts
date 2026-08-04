'use server';

import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { formString, formInt } from '@/lib/form-helpers';
import { withBusinessStoreContext, formAction, UserError } from '@/lib/action-utils';
import { checkAndSendLowStockAlert } from '@/app/actions/stock-alerts';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';
import { isInventoryDecreasePhase1Enabled } from '@/lib/inventory-decrease-flag';
import { isInventoryIncreasePhase2EnabledForBusiness } from '@/lib/inventory-increase-flag';
import {
  createInventoryDecrease,
  InventoryDecreaseError,
  isInventoryDecreaseReasonCode,
} from '@/lib/services/inventory-decrease';
import {
  createInventoryIncrease,
  InventoryIncreaseError,
  isInventoryIncreaseReasonCode,
} from '@/lib/services/inventory-increase';

function mapAdjustmentError(error: unknown): never {
  if (error instanceof InventoryDecreaseError || error instanceof InventoryIncreaseError) {
    throw new UserError(error.message);
  }
  throw error;
}

/**
 * Phase 1 decrease and Phase 2 controlled increase.
 * Does not call legacy createStockAdjustment.
 * Authoritative audit is written inside the service transaction.
 */
export async function createStockAdjustmentAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId, storeId: defaultStoreId } =
      await withBusinessStoreContext(['MANAGER', 'OWNER']);

    const storeId = formString(formData, 'storeId') || defaultStoreId;
    const productId = formString(formData, 'productId');
    const unitId = formString(formData, 'unitId');
    const qtyInUnit = formInt(formData, 'qtyInUnit');
    const direction = (formString(formData, 'direction') || '').toUpperCase();
    const reasonCodeRaw = formString(formData, 'reasonCode');
    const reason = formString(formData, 'reason') || '';
    const idempotencyKey = formString(formData, 'idempotencyKey');
    const correctsAdjustmentId = formString(formData, 'correctsAdjustmentId') || null;

    if (!idempotencyKey) {
      throw new UserError('Missing idempotency key. Refresh and try again.');
    }

    if (direction === 'DECREASE') {
      if (!isInventoryDecreasePhase1Enabled()) {
        throw new UserError('Inventory decreases are temporarily unavailable.');
      }
      if (!isInventoryDecreaseReasonCode(reasonCodeRaw)) {
        throw new UserError('Select a valid decrease reason code.');
      }
      if (correctsAdjustmentId && user.role !== 'OWNER') {
        throw new UserError('Only Owner may post a compensating correction.');
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
          correctsAdjustmentId,
        });
      } catch (error) {
        mapAdjustmentError(error);
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

      const params = new URLSearchParams({
        posted: '1',
        direction: 'DECREASE',
        ref: adjustment.id,
        added: String(Math.abs(adjustment.qtyBase)),
        value: String(adjustment.valuePence ?? 0),
      });
      redirect(`/inventory/adjustments?${params.toString()}`);
    }

    if (direction === 'INCREASE') {
      // Server-authoritative scoped gate (global flag + exact business allowlist).
      // UI visibility is not the enforcement boundary.
      if (!isInventoryIncreasePhase2EnabledForBusiness(businessId)) {
        throw new UserError('Inventory increases are temporarily unavailable.');
      }
      if (!isInventoryIncreaseReasonCode(reasonCodeRaw)) {
        throw new UserError('Select a valid increase reason code.');
      }
      if (correctsAdjustmentId && user.role !== 'OWNER') {
        throw new UserError('Only Owner may post a compensating correction.');
      }

      let adjustment;
      try {
        adjustment = await createInventoryIncrease({
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
          correctsAdjustmentId,
        });
      } catch (error) {
        mapAdjustmentError(error);
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

      const params = new URLSearchParams({
        posted: '1',
        direction: 'INCREASE',
        ref: adjustment.id,
        prev: String(adjustment.previousQtyBase),
        added: String(adjustment.qtyBase),
        newQty: String(adjustment.newQtyBase),
        value: String(adjustment.valuePence ?? 0),
        cost: String(adjustment.unitCostBasePence ?? 0),
        replayed: adjustment.replayed ? '1' : '0',
      });
      redirect(`/inventory/adjustments?${params.toString()}`);
    }

    throw new UserError('Select Record decrease or Record increase.');
  }, '/inventory/adjustments');
}

/**
 * Automated reversal is unavailable (payload-safe compensating entries are
 * Owner-only opposite postings until a dedicated reversal workflow lands).
 */
export async function reverseStockAdjustmentAction(_formData: FormData): Promise<void> {
  return formAction(async () => {
    await withBusinessStoreContext(['OWNER']);
    throw new UserError(
      'Automated adjustment reversal is unavailable. Use an Owner-only opposite compensating adjustment with a link to the original record.',
    );
  }, '/inventory/adjustments');
}
