'use server';

import { prisma } from '@/lib/prisma';
import { requireRole, requireUser } from '@/lib/auth';
import { createExpense } from '@/lib/services/expenses';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { redirect } from 'next/navigation';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const toPence = (value: string) => {
  const trimmed = value.replace(/,/g, '').trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
};

export async function createExpenseAction(formData: FormData) {
  const user = await requireUser();
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  const store = await prisma.store.findFirst();
  if (!business || !store) redirect('/settings');

  const amountPence = toPence(String(formData.get('amount') || ''));
  const method = String(formData.get('method') || 'CASH') as 'CASH' | 'CARD' | 'TRANSFER';
  const paymentStatus = String(formData.get('paymentStatus') || 'PAID') as
    | 'PAID'
    | 'PART_PAID'
    | 'UNPAID';
  let amountPaidPence = toPence(String(formData.get('amountPaid') || ''));
  const notes = String(formData.get('notes') || '') || null;
  const accountId = String(formData.get('accountId') || '');
  const useSimple = String(formData.get('useSimple') || '') === 'true';
  const vendorName = String(formData.get('vendorName') || '') || null;
  const reference = String(formData.get('reference') || '') || null;
  const dueDateRaw = String(formData.get('dueDate') || '');
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;

  let attachmentPath: string | null = null;
  const file = formData.get('attachment');
  if (file && typeof file !== 'string' && file.size > 0) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'expenses');
    await mkdir(uploadsDir, { recursive: true });
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const fullPath = path.join(uploadsDir, safeName);
    await writeFile(fullPath, buffer);
    attachmentPath = `/uploads/expenses/${safeName}`;
  }

  let resolvedAccountId = accountId;
  if (useSimple || !resolvedAccountId) {
    const operating = await prisma.account.findFirst({
      where: { businessId: business.id, code: ACCOUNT_CODES.operatingExpenses }
    });
    if (!operating) {
      throw new Error('Operating Expenses account not found');
    }
    resolvedAccountId = operating.id;
  }

  if (paymentStatus === 'PAID' && amountPaidPence === 0) {
    amountPaidPence = amountPence;
  }

  await createExpense({
    businessId: business.id,
    storeId: store.id,
    userId: user.id,
    accountId: resolvedAccountId,
    amountPence,
    paymentStatus,
    method,
    amountPaidPence,
    dueDate,
    vendorName,
    reference,
    attachmentPath,
    notes
  });

  redirect('/expenses');
}
