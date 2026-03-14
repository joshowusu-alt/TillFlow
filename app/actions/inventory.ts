'use server';

import { createStockAdjustment } from '@/lib/services/inventory';
import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { formString, formInt } from '@/lib/form-helpers';
import { StockDirectionEnum } from '@/lib/validation/enums';
import { withBusinessStoreContext, formAction, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import { checkAndSendLowStockAlert } from '@/app/actions/stock-alerts';

export async function createStockAdjustmentAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId, storeId: defaultStoreId } =
      await withBusinessStoreContext(['MANAGER', 'OWNER']);

    const storeId = formString(formData, 'storeId') || defaultStoreId;
    const productId = formString(formData, 'productId');
    const unitId = formString(formData, 'unitId');
    const qtyInUnit = formInt(formData, 'qtyInUnit');
    const direction = (formString(formData, 'direction') || 'DECREASE') as 'INCREASE' | 'DECREASE';
    const dirValidation = StockDirectionEnum.safeParse(direction);
    if (!dirValidation.success) {
      redirect('/inventory?error=invalid-direction');
    }
    const reason = formString(formData, 'reason') || null;

    const adjustment = await createStockAdjustment({
      businessId,
      storeId,
      productId,
      unitId,
      qtyInUnit,
      direction,
      reason,
      userId: user.id
    });

    void checkAndSendLowStockAlert({
      businessId,
      storeId,
      productIds: [adjustment.productId],
    }).catch(() => {});

    // Fire-and-forget: don't block the user on audit logging
    audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'INVENTORY_ADJUST', entity: 'Product', entityId: productId, details: { direction, qtyInUnit, unitId, reason } }).catch(() => {});

    revalidateTag('pos-products');
    revalidateTag('reports');

    redirect('/inventory/adjustments');
  }, '/inventory');
}
