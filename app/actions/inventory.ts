'use server';

import { createStockAdjustment } from '@/lib/services/inventory';
import { redirect } from 'next/navigation';
import { formString, formInt } from '@/lib/form-helpers';
import { withBusinessStoreContext, formAction, type ActionResult } from '@/lib/action-utils';

export async function createStockAdjustmentAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId, storeId: defaultStoreId } =
      await withBusinessStoreContext(['MANAGER', 'OWNER']);

    const storeId = formString(formData, 'storeId') || defaultStoreId;
    const productId = formString(formData, 'productId');
    const unitId = formString(formData, 'unitId');
    const qtyInUnit = formInt(formData, 'qtyInUnit');
    const direction = (formString(formData, 'direction') || 'DECREASE') as 'INCREASE' | 'DECREASE';
    const reason = formString(formData, 'reason') || null;

    await createStockAdjustment({
      businessId,
      storeId,
      productId,
      unitId,
      qtyInUnit,
      direction,
      reason,
      userId: user.id
    });

    redirect('/inventory/adjustments');
  });
}
