'use server';

import { createPurchase } from '@/lib/services/purchases';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

const toInt = (value: FormDataEntryValue | null) => {
  if (value === null) return 0;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toPence = (value: any) => {
  if (value === null || value === undefined) return 0;
  const trimmed = String(value).replace(/,/g, '').trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
};

export async function createPurchaseAction(formData: FormData) {
  await requireUser();
  const business = await prisma.business.findFirst();
  if (!business) redirect('/settings');

  const storeId = String(formData.get('storeId') || '');
  const supplierId = String(formData.get('supplierId') || '') || null;
  const paymentStatus = String(formData.get('paymentStatus') || 'PAID') as
    | 'PAID'
    | 'PART_PAID'
    | 'UNPAID';
  const dueDateRaw = formData.get('dueDate');
  const dueDate = dueDateRaw ? new Date(String(dueDateRaw)) : null;

  let lines: { productId: string; unitId: string; qtyInUnit: number; unitCostPence?: number | null }[] =
    [];
  const cartRaw = formData.get('cart');
  if (cartRaw) {
    try {
      const parsed = JSON.parse(String(cartRaw));
      if (Array.isArray(parsed)) {
        lines = parsed
          .map((item) => ({
            productId: String(item.productId || ''),
            unitId: String(item.unitId || ''),
            qtyInUnit: Number(item.qtyInUnit || 0),
            unitCostPence: toPence(item.unitCostInput ?? item.unitCostPence ?? '')
          }))
          .filter((item) => item.productId && item.unitId && item.qtyInUnit > 0);
      }
    } catch {
      lines = [];
    }
  }

  await createPurchase({
    businessId: business.id,
    storeId,
    supplierId,
    paymentStatus,
    dueDate,
    payments: [
      { method: 'CASH', amountPence: toInt(formData.get('cashPaid')) },
      { method: 'CARD', amountPence: toInt(formData.get('cardPaid')) },
      { method: 'TRANSFER', amountPence: toInt(formData.get('transferPaid')) }
    ],
    lines
  });

  redirect('/purchases');
}
