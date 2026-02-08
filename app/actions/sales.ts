'use server';

import { createSale } from '@/lib/services/sales';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

const toInt = (value: FormDataEntryValue | null) => {
  if (value === null) return 0;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toPence = (value: FormDataEntryValue | null) => {
  if (value === null) return 0;
  const trimmed = String(value).replace(/,/g, '').trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
};

const parseDiscountValue = (type: string | undefined, raw: any) => {
  if (!type || type === 'NONE') return 0;
  if (type === 'PERCENT') {
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (type === 'AMOUNT') {
    return toPence(raw ?? '');
  }
  return 0;
};

export async function createSaleAction(formData: FormData) {
  const user = await requireUser();
  const business = await prisma.business.findFirst();
  if (!business) redirect('/settings');

  const storeId = String(formData.get('storeId') || '');
  const tillId = String(formData.get('tillId') || '');
  const productId = String(formData.get('productId') || '');
  const unitId = String(formData.get('unitId') || '');
  const qtyInUnit = toInt(formData.get('qtyInUnit'));
  const paymentStatus = String(formData.get('paymentStatus') || 'PAID') as
    | 'PAID'
    | 'PART_PAID'
    | 'UNPAID';
  const customerId = String(formData.get('customerId') || '') || null;
  const dueDateRaw = formData.get('dueDate');
  const dueDate = dueDateRaw ? new Date(String(dueDateRaw)) : null;
  const orderDiscountType = String(formData.get('orderDiscountType') || 'NONE') as
    | 'NONE'
    | 'PERCENT'
    | 'AMOUNT';
  const orderDiscountValue = parseDiscountValue(orderDiscountType, formData.get('orderDiscountValue'));

  let lines: {
    productId: string;
    unitId: string;
    qtyInUnit: number;
    discountType?: 'NONE' | 'PERCENT' | 'AMOUNT';
    discountValue?: number;
  }[] = [];
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
            discountType: (item.discountType || 'NONE') as 'NONE' | 'PERCENT' | 'AMOUNT',
            discountValue: parseDiscountValue(item.discountType, item.discountValue)
          }))
          .filter((item) => item.productId && item.unitId && item.qtyInUnit > 0);
      }
    } catch {
      lines = [];
    }
  }

  if (lines.length === 0 && productId && unitId && qtyInUnit > 0) {
    lines = [{ productId, unitId, qtyInUnit }];
  }

  if (paymentStatus !== 'PAID' && !customerId) {
    redirect('/pos?error=customer-required');
  }

  try {
    const invoice = await createSale({
      businessId: business.id,
      storeId,
      tillId,
      cashierUserId: user.id,
      customerId,
      paymentStatus,
      dueDate,
      orderDiscountType,
      orderDiscountValue,
      payments: [
        { method: 'CASH', amountPence: toInt(formData.get('cashPaid')) },
        { method: 'CARD', amountPence: toInt(formData.get('cardPaid')) },
        { method: 'TRANSFER', amountPence: toInt(formData.get('transferPaid')) }
      ],
      lines
    });

    redirect(`/receipts/${invoice.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Insufficient stock')) {
      redirect('/pos?error=insufficient-stock');
    }
    if (message.includes('Customer is required')) {
      redirect('/pos?error=customer-required');
    }
    throw error;
  }
}
