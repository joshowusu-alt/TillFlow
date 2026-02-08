'use server';

import { createSalesReturn, createPurchaseReturn } from '@/lib/services/returns';
import { requireUser, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

const toInt = (value: FormDataEntryValue | null) => {
  if (value === null) return 0;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export async function createSalesReturnAction(formData: FormData) {
  const user = await requireUser();
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) redirect('/settings');

  const salesInvoiceId = String(formData.get('salesInvoiceId') || '');
  const refundMethod = String(formData.get('refundMethod') || '') as
    | 'CASH'
    | 'CARD'
    | 'TRANSFER'
    | '';
  const refundAmountPence = toInt(formData.get('refundAmountPence'));
  const type = String(formData.get('type') || 'RETURN') as 'RETURN' | 'VOID';
  const reason = String(formData.get('reason') || '') || null;

  await createSalesReturn({
    businessId: business.id,
    salesInvoiceId,
    userId: user.id,
    refundMethod: refundMethod || null,
    refundAmountPence,
    reason,
    type
  });

  redirect('/sales');
}

export async function createPurchaseReturnAction(formData: FormData) {
  const user = await requireUser();
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) redirect('/settings');

  const purchaseInvoiceId = String(formData.get('purchaseInvoiceId') || '');
  const refundMethod = String(formData.get('refundMethod') || '') as
    | 'CASH'
    | 'CARD'
    | 'TRANSFER'
    | '';
  const refundAmountPence = toInt(formData.get('refundAmountPence'));
  const type = String(formData.get('type') || 'RETURN') as 'RETURN' | 'VOID';
  const reason = String(formData.get('reason') || '') || null;

  await createPurchaseReturn({
    businessId: business.id,
    purchaseInvoiceId,
    userId: user.id,
    refundMethod: refundMethod || null,
    refundAmountPence,
    reason,
    type
  });

  redirect('/purchases');
}
