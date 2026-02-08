'use server';

import { recordCustomerPayment, recordSupplierPayment } from '@/lib/services/payments';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

const toPence = (value: FormDataEntryValue | null) => {
  if (value === null) return 0;
  const trimmed = String(value).replace(/,/g, '').trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
};

export async function recordCustomerPaymentAction(formData: FormData) {
  await requireUser();
  const business = await prisma.business.findFirst();
  if (!business) redirect('/settings');

  const invoiceId = String(formData.get('invoiceId') || '');
  const amount = formData.get('amount');
  const method = String(formData.get('paymentMethod') || 'CASH') as 'CASH' | 'CARD' | 'TRANSFER';
  if (amount !== null) {
    await recordCustomerPayment(business.id, invoiceId, [
      { method, amountPence: toPence(amount) }
    ]);
  } else {
    await recordCustomerPayment(business.id, invoiceId, [
      { method: 'CASH', amountPence: toPence(formData.get('cashPaid')) },
      { method: 'CARD', amountPence: toPence(formData.get('cardPaid')) },
      { method: 'TRANSFER', amountPence: toPence(formData.get('transferPaid')) }
    ]);
  }

  redirect('/payments/customer-receipts');
}

export async function recordSupplierPaymentAction(formData: FormData) {
  await requireUser();
  const business = await prisma.business.findFirst();
  if (!business) redirect('/settings');

  const invoiceId = String(formData.get('invoiceId') || '');
  const amount = formData.get('amount');
  const method = String(formData.get('paymentMethod') || 'CASH') as 'CASH' | 'CARD' | 'TRANSFER';
  if (amount !== null) {
    await recordSupplierPayment(business.id, invoiceId, [
      { method, amountPence: toPence(amount) }
    ]);
  } else {
    await recordSupplierPayment(business.id, invoiceId, [
      { method: 'CASH', amountPence: toPence(formData.get('cashPaid')) },
      { method: 'CARD', amountPence: toPence(formData.get('cardPaid')) },
      { method: 'TRANSFER', amountPence: toPence(formData.get('transferPaid')) }
    ]);
  }

  redirect('/payments/supplier-payments');
}
