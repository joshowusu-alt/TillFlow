'use server';

import { requireBusinessStore } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function markAsOrdered(formData: FormData) {
  const { user, business, store } = await requireBusinessStore(['MANAGER', 'OWNER']);

  const productId = formData.get('productId') as string;
  const qtyBase = parseInt(formData.get('qtyBase') as string, 10);
  const supplierId = (formData.get('supplierId') as string) || null;
  const notes = (formData.get('notes') as string) || null;
  const storeId = (formData.get('storeId') as string) || store.id;

  if (!productId || !qtyBase || qtyBase <= 0) {
    return { error: 'Invalid product or quantity' };
  }

  // Verify product belongs to this business
  const product = await prisma.product.findFirst({
    where: { id: productId, businessId: business.id },
    select: { id: true },
  });
  if (!product) {
    return { error: 'Product not found' };
  }

  await prisma.reorderAction.create({
    data: {
      businessId: business.id,
      storeId,
      productId,
      supplierId,
      qtyBase,
      userId: user.id,
      notes,
    },
  });

  revalidatePath('/reports/reorder-suggestions');
  return { success: true };
}

export async function markAsReceived(formData: FormData) {
  const { business } = await requireBusinessStore(['MANAGER', 'OWNER']);

  const reorderActionId = formData.get('reorderActionId') as string;
  if (!reorderActionId) {
    return { error: 'Missing reorder action ID' };
  }

  const action = await prisma.reorderAction.findFirst({
    where: { id: reorderActionId, businessId: business.id },
  });
  if (!action) {
    return { error: 'Reorder action not found' };
  }

  await prisma.reorderAction.update({
    where: { id: reorderActionId },
    data: {
      status: 'RECEIVED',
      receivedAt: new Date(),
    },
  });

  revalidatePath('/reports/reorder-suggestions');
  return { success: true };
}

export async function cancelReorder(formData: FormData) {
  const { business } = await requireBusinessStore(['MANAGER', 'OWNER']);

  const reorderActionId = formData.get('reorderActionId') as string;
  if (!reorderActionId) {
    return { error: 'Missing reorder action ID' };
  }

  const action = await prisma.reorderAction.findFirst({
    where: { id: reorderActionId, businessId: business.id },
  });
  if (!action) {
    return { error: 'Reorder action not found' };
  }

  await prisma.reorderAction.update({
    where: { id: reorderActionId },
    data: { status: 'CANCELLED' },
  });

  revalidatePath('/reports/reorder-suggestions');
  return { success: true };
}
