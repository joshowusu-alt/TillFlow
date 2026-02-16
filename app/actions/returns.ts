'use server';

import { createSalesReturn, createPurchaseReturn } from '@/lib/services/returns';
import { redirect } from 'next/navigation';
import { formString, formInt } from '@/lib/form-helpers';
import { withBusinessContext, formAction, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';

export async function createSalesReturnAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const salesInvoiceId = formString(formData, 'salesInvoiceId');
    const refundMethod = formString(formData, 'refundMethod') as 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY' | '';
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

    await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: type === 'VOID' ? 'SALE_VOID' : 'SALE_RETURN', entity: 'SalesInvoice', entityId: salesInvoiceId, details: { type, reason, refundAmountPence } });

    redirect('/sales');
  }, '/sales');
}

export async function createPurchaseReturnAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const purchaseInvoiceId = formString(formData, 'purchaseInvoiceId');
    const refundMethod = formString(formData, 'refundMethod') as 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY' | '';
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

    await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'PURCHASE_RETURN', entity: 'PurchaseInvoice', entityId: purchaseInvoiceId, details: { type, reason, refundAmountPence } });

    redirect('/purchases');
  }, '/purchases');
}
