'use server';

import { recordCustomerPayment, recordSupplierPayment } from '@/lib/services/payments';
import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { toPence } from '@/lib/form-helpers';
import { formString, formPence } from '@/lib/form-helpers';
import { withBusinessContext, formAction, type ActionResult } from '@/lib/action-utils';
import type { PaymentMethod, PaymentInput } from '@/lib/services/shared';

/** Build a payments array from FormData — supports both single-amount and split modes. */
function parsePayments(formData: FormData): PaymentInput[] {
  const amount = formData.get('amount');
  const method = (formString(formData, 'paymentMethod') || 'CASH') as PaymentMethod;

  if (amount !== null) {
    return [{ method, amountPence: toPence(amount) }];
  }
  return [
    { method: 'CASH', amountPence: toPence(formData.get('cashPaid')) },
    { method: 'CARD', amountPence: toPence(formData.get('cardPaid')) },
    { method: 'TRANSFER', amountPence: toPence(formData.get('transferPaid')) }
  ];
}

export async function recordCustomerPaymentAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId, user } = await withBusinessContext();

    const invoiceId = formString(formData, 'invoiceId');
    const payments = parsePayments(formData);

    await recordCustomerPayment(businessId, invoiceId, payments, user.id);
    revalidateTag('reports');
    const returnTo = formString(formData, 'returnTo') || '/payments/customer-receipts';
    redirect(returnTo);
  }, '/payments/customer-receipts');
}

export async function recordSupplierPaymentAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId, user } = await withBusinessContext();

    const invoiceId = formString(formData, 'invoiceId');
    const payments = parsePayments(formData);
    const paidAtStr = formString(formData, 'paidAt');
    const paidAt = paidAtStr ? new Date(paidAtStr) : undefined;
    const notes = formString(formData, 'notes') || undefined;

    await recordSupplierPayment(businessId, invoiceId, payments, paidAt, user.id, notes);
    revalidateTag('reports');
    const returnTo = formString(formData, 'returnTo') || '/payments/supplier-payments';
    redirect(returnTo);
  }, '/payments/supplier-payments');
}
