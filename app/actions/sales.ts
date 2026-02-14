'use server';

import { createSale } from '@/lib/services/sales';
import { redirect } from 'next/navigation';
import { toInt, toPence } from '@/lib/form-helpers';
import { formString, formInt, formDate } from '@/lib/form-helpers';
import { withBusinessContext, formAction, safeAction, type ActionResult } from '@/lib/action-utils';
import type { PaymentStatus } from '@/lib/services/shared';
import type { DiscountType } from '@/lib/services/sales';

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

export async function createSaleAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext();

    const storeId = formString(formData, 'storeId');
    const tillId = formString(formData, 'tillId');
    const productId = formString(formData, 'productId');
    const unitId = formString(formData, 'unitId');
    const qtyInUnit = formInt(formData, 'qtyInUnit');
    const paymentStatus = (formString(formData, 'paymentStatus') || 'PAID') as PaymentStatus;
    const customerId = formString(formData, 'customerId') || null;
    const dueDate = formDate(formData, 'dueDate');
    const orderDiscountType = (formString(formData, 'orderDiscountType') || 'NONE') as DiscountType;
    const orderDiscountValue = parseDiscountValue(
      orderDiscountType,
      formData.get('orderDiscountValue')
    );

    let lines: {
      productId: string;
      unitId: string;
      qtyInUnit: number;
      discountType?: DiscountType;
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
              discountType: (item.discountType || 'NONE') as DiscountType,
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
        businessId,
        storeId,
        tillId,
        cashierUserId: user.id,
        customerId,
        paymentStatus,
        dueDate,
        orderDiscountType,
        orderDiscountValue,
        payments: [
          { method: 'CASH', amountPence: formInt(formData, 'cashPaid') },
          { method: 'CARD', amountPence: formInt(formData, 'cardPaid') },
          { method: 'TRANSFER', amountPence: formInt(formData, 'transferPaid') }
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
  });
}
