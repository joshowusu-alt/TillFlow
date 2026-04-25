'use server';

import { createStockAdjustment } from '@/lib/services/inventory';
import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { formString, formInt } from '@/lib/form-helpers';
import { StockDirectionEnum } from '@/lib/validation/enums';
import { withBusinessStoreContext, formAction, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import { checkAndSendLowStockAlert } from '@/app/actions/stock-alerts';
import { prisma } from '@/lib/prisma';

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

export async function reverseStockAdjustmentAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessStoreContext(['OWNER']);

    const adjustmentId = formString(formData, 'adjustmentId');
    const ownerReason = formString(formData, 'reason') || null;
    if (!adjustmentId) {
      redirect('/inventory/adjustments?error=missing-adjustment');
    }

    const adjustment = await prisma.stockAdjustment.findFirst({
      where: {
        id: adjustmentId,
        store: { businessId },
      },
      select: {
        id: true,
        storeId: true,
        productId: true,
        unitId: true,
        qtyInUnit: true,
        qtyBase: true,
        direction: true,
        reason: true,
        product: { select: { name: true } },
      },
    });

    if (!adjustment) {
      redirect('/inventory/adjustments?error=adjustment-not-found');
    }

    const existingReversal = await prisma.stockAdjustment.findFirst({
      where: {
        storeId: adjustment.storeId,
        productId: adjustment.productId,
        reason: { contains: `Reversal of adjustment ${adjustment.id}` },
      },
      select: { id: true },
    });

    if (existingReversal) {
      redirect('/inventory/adjustments?error=already-reversed');
    }

    const wasIncrease = adjustment.direction === 'INCREASE' || adjustment.direction === 'IN';
    const reverseDirection = wasIncrease ? 'DECREASE' : 'INCREASE';
    const reason = [
      `Reversal of adjustment ${adjustment.id}`,
      ownerReason ? ownerReason : null,
      adjustment.reason ? `Original reason: ${adjustment.reason}` : null,
    ].filter(Boolean).join(' | ');

    const reversal = await createStockAdjustment({
      businessId,
      storeId: adjustment.storeId,
      productId: adjustment.productId,
      unitId: adjustment.unitId,
      qtyInUnit: adjustment.qtyInUnit,
      direction: reverseDirection,
      reason,
      userId: user.id,
    });

    void checkAndSendLowStockAlert({
      businessId,
      storeId: adjustment.storeId,
      productIds: [adjustment.productId],
    }).catch(() => {});

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'INVENTORY_ADJUST',
      entity: 'StockAdjustment',
      entityId: adjustment.id,
      details: {
        correctionType: 'REVERSAL',
        productId: adjustment.productId,
        productName: adjustment.product.name,
        originalDirection: adjustment.direction,
        originalQtyBase: adjustment.qtyBase,
        reversalAdjustmentId: reversal.id,
        reversalDirection: reverseDirection,
        reason: ownerReason,
      },
    }).catch(() => {});

    revalidateTag('pos-products');
    revalidateTag('reports');
    revalidatePath('/inventory');
    revalidatePath('/inventory/adjustments');

    redirect('/inventory/adjustments?reversed=1');
  }, '/inventory/adjustments');
}
