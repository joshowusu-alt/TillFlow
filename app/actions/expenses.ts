'use server';

import { prisma } from '@/lib/prisma';
import { createExpense } from '@/lib/services/expenses';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { formString, formOptionalString, formPence, formDate } from '@/lib/form-helpers';
import { withBusinessStoreContext, formAction, err, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import type { PaymentMethod, PaymentStatus } from '@/lib/services/shared';
import { saveExpenseAttachment, type AttachmentResult } from '@/lib/services/storage';

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

    const attachmentResult = await saveExpenseAttachment(formData);
    if (attachmentResult !== null && typeof attachmentResult === 'object' && 'error' in attachmentResult) {
      return err(attachmentResult.error);
    }
    const attachmentPath = attachmentResult as string | null;

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

    audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'EXPENSE_CREATE', entity: 'Expense', details: { amountPence, vendorName, notes } }).catch((e) => console.error('[audit] expense create failed', e));

    revalidateTag('reports');
    redirect('/expenses');
  }, '/expenses');
}
