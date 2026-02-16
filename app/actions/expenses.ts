'use server';

import { prisma } from '@/lib/prisma';
import { createExpense } from '@/lib/services/expenses';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { redirect } from 'next/navigation';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { formString, formOptionalString, formPence, formDate } from '@/lib/form-helpers';
import { withBusinessStoreContext, formAction, err, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import type { PaymentMethod, PaymentStatus } from '@/lib/services/shared';

/** Save an uploaded file and return its public path (or null). */
async function saveAttachment(formData: FormData): Promise<string | null> {
  const file = formData.get('attachment');
  if (!file || typeof file === 'string' || file.size === 0) return null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'expenses');
  await mkdir(uploadsDir, { recursive: true });
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  await writeFile(path.join(uploadsDir, safeName), buffer);
  return `/uploads/expenses/${safeName}`;
}

export async function createExpenseAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId, storeId } = await withBusinessStoreContext(['MANAGER', 'OWNER']);

    const amountPence = formPence(formData, 'amount');
    const method = (formString(formData, 'method') || 'CASH') as PaymentMethod;
    const paymentStatus = (formString(formData, 'paymentStatus') || 'PAID') as PaymentStatus;
    let amountPaidPence = formPence(formData, 'amountPaid');
    const notes = formOptionalString(formData, 'notes');
    const accountId = formString(formData, 'accountId');
    const useSimple = formString(formData, 'useSimple') === 'true';
    const vendorName = formOptionalString(formData, 'vendorName');
    const reference = formOptionalString(formData, 'reference');
    const dueDate = formDate(formData, 'dueDate');

    const attachmentPath = await saveAttachment(formData);

    let resolvedAccountId = accountId;
    if (useSimple || !resolvedAccountId) {
      const operating = await prisma.account.findFirst({
        where: { businessId, code: ACCOUNT_CODES.operatingExpenses }
      });
      if (!operating) return err('Could not find the default expenses account. Please check your settings.');
      resolvedAccountId = operating.id;
    }

    if (paymentStatus === 'PAID' && amountPaidPence === 0) {
      amountPaidPence = amountPence;
    }

    await createExpense({
      businessId,
      storeId,
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

    await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'EXPENSE_CREATE', entity: 'Expense', details: { amountPence, vendorName, notes } });

    redirect('/expenses');
  }, '/expenses');
}
