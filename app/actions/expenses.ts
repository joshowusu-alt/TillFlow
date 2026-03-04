'use server';

import { prisma } from '@/lib/prisma';
import { createExpense } from '@/lib/services/expenses';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { formString, formOptionalString, formPence, formDate } from '@/lib/form-helpers';
import { withBusinessStoreContext, withBusinessContext, formAction, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { PaymentStatusEnum, PaymentMethodEnum } from '@/lib/validation/enums';
import { audit } from '@/lib/audit';
import type { PaymentMethod, PaymentStatus } from '@/lib/services/shared';
import { saveExpenseAttachment, type AttachmentResult } from '@/lib/services/storage';

export async function createExpenseAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId, storeId } = await withBusinessStoreContext(['MANAGER', 'OWNER']);

    const amountPence = formPence(formData, 'amount');
    const method = (formString(formData, 'method') || 'CASH') as PaymentMethod;
    const methodValidation = PaymentMethodEnum.safeParse(method);
    if (!methodValidation.success) {
      return err(methodValidation.error.issues[0].message);
    }
    const paymentStatus = (formString(formData, 'paymentStatus') || 'PAID') as PaymentStatus;
    const psValidation = PaymentStatusEnum.safeParse(paymentStatus);
    if (!psValidation.success) {
      return err(psValidation.error.issues[0].message);
    }
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

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');
    if (!id) return err('Expense ID is required.');

    const expense = await prisma.expense.findFirst({
      where: { id, businessId },
      select: { id: true, amountPence: true, vendorName: true },
    });
    if (!expense) return err('Expense not found. It may have already been removed.');

    await prisma.expense.delete({ where: { id: expense.id } });

    audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'EXPENSE_DELETE', entity: 'Expense', entityId: id, details: { amountPence: expense.amountPence, vendorName: expense.vendorName } }).catch(() => {});

    revalidateTag('reports');
    redirect('/expenses');
  }, '/expenses');
}
