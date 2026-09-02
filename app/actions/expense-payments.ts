'use server';

import { recordExpensePayment } from '@/lib/services/expensePayments';
import { CASH_EXPENSE_SHIFT_REQUIRED_MSG } from '@/lib/services/expenses';
import { redirect } from 'next/navigation';
import { formString, formPence, formOptionalString } from '@/lib/form-helpers';
import { withBusinessStoreContext, formAction, type ActionResult } from '@/lib/action-utils';
import type { PaymentMethod } from '@/lib/services/shared';

export async function recordExpensePaymentAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId, storeId } = await withBusinessStoreContext(['MANAGER', 'OWNER']);

    const expenseId = formString(formData, 'expenseId');
    const method = (formString(formData, 'method') || 'CASH') as PaymentMethod;
    const amountPence = formPence(formData, 'amount');
    const tillId = formString(formData, 'tillId');
    const reference = formOptionalString(formData, 'reference');
    const idempotencyKey = formString(formData, 'idempotencyKey');
    if (!idempotencyKey) {
      throw new Error('This payment form is out of date. Refresh the page or reopen the payment form, then try again.');
    }
    if (method === 'CASH' && amountPence > 0 && !tillId) {
      throw new Error(CASH_EXPENSE_SHIFT_REQUIRED_MSG);
    }

    await recordExpensePayment({
      businessId,
      storeId,
      userId: user.id,
      expenseId,
      method,
      amountPence,
      tillId: tillId || undefined,
      reference,
      idempotencyKey,
    });

    redirect('/payments/expense-payments');
  }, '/payments/expense-payments');
}
