'use server';

import { createSalesReturn, createPurchaseReturn } from '@/lib/services/returns';
import { redirect } from 'next/navigation';
import { formString, formInt } from '@/lib/form-helpers';
import { withBusinessContext, formAction, type ActionResult } from '@/lib/action-utils';

export async function createSalesReturnAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const salesInvoiceId = formString(formData, 'salesInvoiceId');
    const refundMethod = formString(formData, 'refundMethod') as 'CASH' | 'CARD' | 'TRANSFER' | '';
    const refundAmountPence = formInt(formData, 'refundAmountPence');
    const type = (formString(formData, 'type') || 'RETURN') as 'RETURN' | 'VOID';
    const reason = formString(formData, 'reason') || null;

    await createSalesReturn({
      businessId,
      salesInvoiceId,
      userId: user.id,
      refundMethod: refundMethod || null,
      refundAmountPence,
      reason,
      type
    });

    redirect('/sales');
  });
}

export async function createPurchaseReturnAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const purchaseInvoiceId = formString(formData, 'purchaseInvoiceId');
    const refundMethod = formString(formData, 'refundMethod') as 'CASH' | 'CARD' | 'TRANSFER' | '';
    const refundAmountPence = formInt(formData, 'refundAmountPence');
    const type = (formString(formData, 'type') || 'RETURN') as 'RETURN' | 'VOID';
    const reason = formString(formData, 'reason') || null;

    await createPurchaseReturn({
      businessId,
      purchaseInvoiceId,
      userId: user.id,
      refundMethod: refundMethod || null,
      refundAmountPence,
      reason,
      type
    });

    redirect('/purchases');
  });
}
