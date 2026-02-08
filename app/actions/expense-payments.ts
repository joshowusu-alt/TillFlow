'use server';

import { prisma } from '@/lib/prisma';
import { requireRole, requireUser } from '@/lib/auth';
import { recordExpensePayment } from '@/lib/services/expensePayments';
import { redirect } from 'next/navigation';

const toPence = (value: string) => {
  const trimmed = value.replace(/,/g, '').trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
};

export async function recordExpensePaymentAction(formData: FormData) {
  const user = await requireUser();
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  const store = await prisma.store.findFirst();
  if (!business || !store) redirect('/settings');

  const expenseId = String(formData.get('expenseId') || '');
  const method = String(formData.get('method') || 'CASH') as 'CASH' | 'CARD' | 'TRANSFER';
  const amountPence = toPence(String(formData.get('amount') || ''));
  const reference = String(formData.get('reference') || '') || null;

  await recordExpensePayment({
    businessId: business.id,
    storeId: store.id,
    userId: user.id,
    expenseId,
    method,
    amountPence,
    reference
  });

  redirect('/payments/expense-payments');
}
