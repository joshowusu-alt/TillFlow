'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath, revalidateTag } from 'next/cache';
import {
  withBusinessContext,
  withBusinessStoreContext,
  safeAction,
  ok,
  err,
  type ActionResult,
} from '@/lib/action-utils';
import { audit } from '@/lib/audit';

export async function markAsOrdered(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, businessId, storeId: defaultStoreId } = await withBusinessStoreContext(['MANAGER', 'OWNER']);

    const productId = formData.get('productId') as string;
    const qtyBase = parseInt(formData.get('qtyBase') as string, 10);
    const supplierId = (formData.get('supplierId') as string) || null;
    const notes = (formData.get('notes') as string) || null;
    const storeId = (formData.get('storeId') as string) || defaultStoreId;

    if (!productId || !qtyBase || qtyBase <= 0) {
      return err('Invalid product or quantity');
    }

    // Verify product belongs to this business
    const product = await prisma.product.findFirst({
      where: { id: productId, businessId },
      select: { id: true },
    });
    if (!product) {
      return err('Product not found');
    }

    await prisma.reorderAction.create({
      data: {
        businessId,
        storeId,
        productId,
        supplierId,
        qtyBase,
        userId: user.id,
        notes,
      },
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PURCHASE_CREATE',
      entity: 'ReorderAction',
      details: { productId, qtyBase, supplierId, storeId },
    });

    revalidatePath('/reports/reorder-suggestions');
    revalidateTag('reports');
    revalidateTag('pos-products');
    return ok();
  });
}

export async function markAsReceived(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const reorderActionId = formData.get('reorderActionId') as string;
    if (!reorderActionId) {
      return err('Missing reorder action ID');
    }

    const action = await prisma.reorderAction.findFirst({
      where: { id: reorderActionId, businessId },
    });
    if (!action) {
      return err('Reorder action not found');
    }

    await prisma.reorderAction.update({
      where: { id: reorderActionId },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
      },
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'INVENTORY_ADJUST',
      entity: 'ReorderAction',
      entityId: reorderActionId,
      details: { status: 'RECEIVED' },
    });

    revalidatePath('/reports/reorder-suggestions');
    revalidateTag('reports');
    return ok();
  });
}

export async function cancelReorder(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const reorderActionId = formData.get('reorderActionId') as string;
    if (!reorderActionId) {
      return err('Missing reorder action ID');
    }

    const action = await prisma.reorderAction.findFirst({
      where: { id: reorderActionId, businessId },
    });
    if (!action) {
      return err('Reorder action not found');
    }

    await prisma.reorderAction.update({
      where: { id: reorderActionId },
      data: { status: 'CANCELLED' },
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'INVENTORY_ADJUST',
      entity: 'ReorderAction',
      entityId: reorderActionId,
      details: { status: 'CANCELLED' },
    });

    revalidatePath('/reports/reorder-suggestions');
    revalidateTag('reports');
    return ok();
  });
}
