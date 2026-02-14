'use server';

import { createPurchase } from '@/lib/services/purchases';
import { redirect } from 'next/navigation';
import { toInt, toPence } from '@/lib/form-helpers';
import { formString, formInt, formDate } from '@/lib/form-helpers';
import { withBusinessContext, formAction, type ActionResult } from '@/lib/action-utils';
import type { PaymentStatus } from '@/lib/services/shared';

export async function createPurchaseAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext();

    const storeId = formString(formData, 'storeId');
    const supplierId = formString(formData, 'supplierId') || null;
    const paymentStatus = (formString(formData, 'paymentStatus') || 'PAID') as PaymentStatus;
    const dueDate = formDate(formData, 'dueDate');

    let lines: { productId: string; unitId: string; qtyInUnit: number; unitCostPence?: number | null }[] = [];
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
      businessId,
      storeId,
      supplierId,
      paymentStatus,
      dueDate,
      payments: [
        { method: 'CASH', amountPence: formInt(formData, 'cashPaid') },
        { method: 'CARD', amountPence: formInt(formData, 'cardPaid') },
        { method: 'TRANSFER', amountPence: formInt(formData, 'transferPaid') }
      ],
      lines
    });

    redirect('/purchases');
  });
}
