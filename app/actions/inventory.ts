'use server';

import { createStockAdjustment } from '@/lib/services/inventory';
import { requireUser, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

const toInt = (value: FormDataEntryValue | null) => {
  if (value === null) return 0;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export async function createStockAdjustmentAction(formData: FormData) {
  const user = await requireUser();
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) redirect('/settings');

  const storeId = String(formData.get('storeId') || '');
  const productId = String(formData.get('productId') || '');
  const unitId = String(formData.get('unitId') || '');
  const qtyInUnit = toInt(formData.get('qtyInUnit'));
  const direction = String(formData.get('direction') || 'DECREASE') as 'INCREASE' | 'DECREASE';
  const reason = String(formData.get('reason') || '') || null;

  await createStockAdjustment({
    businessId: business.id,
    storeId,
    productId,
    unitId,
    qtyInUnit,
    direction,
    reason,
    userId: user.id
  });

  redirect('/inventory/adjustments');
}
