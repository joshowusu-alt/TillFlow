'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { formString } from '@/lib/form-helpers';
import { requireSelectedStoreContext, formAction, UserError } from '@/lib/action-utils';
import { revalidatePosCatalog } from '@/lib/cache/pos-tags';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';
import {
  InventoryReversalError,
  reverseInventoryAdjustment,
} from '@/lib/services/inventory-reversal';

export async function reverseInventoryAdjustmentAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId, storeId } = await requireSelectedStoreContext(
      ['OWNER'],
      formString(formData, 'storeId'),
    );
    const originalAdjustmentId = formString(formData, 'adjustmentId');
    const reason = formString(formData, 'reason') || '';

    let reversal;
    try {
      reversal = await reverseInventoryAdjustment({
        businessId,
        storeId,
        originalAdjustmentId,
        reason,
        userId: user.id,
        userName: user.name ?? 'Unknown',
        userRole: user.role,
      });
    } catch (error) {
      if (error instanceof InventoryReversalError) {
        throw new UserError(error.message);
      }
      throw error;
    }

    revalidatePosCatalog(businessId, storeId);
    revalidateTag('reports');
    revalidateOwnerDashboardCache();
    const { revalidateImproveRecordsHome } = await import('@/lib/improve-records-revalidate');
    revalidateImproveRecordsHome();

    const params = new URLSearchParams({
      posted: '1',
      direction: reversal.direction,
      ref: reversal.transactionNumber || reversal.id,
      added: String(Math.abs(reversal.qtyBase)),
      value: String(reversal.valuePence ?? 0),
      replayed: reversal.replayed ? '1' : '0',
    });
    redirect(`/inventory/adjustments?${params.toString()}`);
  }, '/inventory/adjustments');
}
