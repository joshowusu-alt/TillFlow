'use server';

import { recordExpensePayment } from '@/lib/services/expensePayments';
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
    const reference = formOptionalString(formData, 'reference');

    await recordExpensePayment({
      businessId,
      storeId,
      userId: user.id,
      expenseId,
      method,
      amountPence,
      reference
    });

    redirect('/payments/expense-payments');
  });
}
