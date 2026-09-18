'use server';

import { recordCustomerPayment, recordSupplierPayment } from '@/lib/services/payments';
import { EXPLICIT_CASH_TILL_REQUIRED_MSG } from '@/lib/services/cash-drawer';
import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { toPence } from '@/lib/form-helpers';
import { formString } from '@/lib/form-helpers';
import { requireSelectedStoreContext, withBusinessContext, formAction } from '@/lib/action-utils';
import {
  assertRequestedStoreMatchesSource,
  MISSING_STORE_CONTEXT_MSG,
  resolveStoreFromTill,
} from '@/lib/reliability/selected-store';
import { prisma } from '@/lib/prisma';
import type { PaymentMethod, PaymentInput } from '@/lib/services/shared';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';

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
    const requestedStoreId = formString(formData, 'storeId');
    const { businessId, user } = await withBusinessContext();

    const invoiceId = formString(formData, 'invoiceId');
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: invoiceId, businessId },
      select: { storeId: true },
    });
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    const storeId = assertRequestedStoreMatchesSource(requestedStoreId, invoice.storeId);
    await requireSelectedStoreContext(undefined, storeId);

    const payments = parsePayments(formData);
    const idempotencyKey = formString(formData, 'idempotencyKey');
    if (!idempotencyKey) {
      throw new Error('This payment form is out of date. Refresh the page or reopen the payment form, then try again.');
    }

    await recordCustomerPayment(businessId, invoiceId, payments, user.id, { idempotencyKey });
    revalidateTag('reports');
    revalidateOwnerDashboardCache();
    const returnTo = formString(formData, 'returnTo') || '/payments/customer-receipts';
    const sep = returnTo.includes('?') ? '&' : '?';
    redirect(`${returnTo}${sep}paid=${encodeURIComponent(invoiceId)}`);
  }, '/payments/customer-receipts');
}

export async function recordSupplierPaymentAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const requestedStoreId = formString(formData, 'storeId');
    const { businessId, user } = await withBusinessContext(['MANAGER', 'OWNER']);
    if (!requestedStoreId) {
      throw new Error(MISSING_STORE_CONTEXT_MSG);
    }

    const invoiceId = formString(formData, 'invoiceId');
    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id: invoiceId, businessId },
      select: { storeId: true },
    });
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    const storeId = assertRequestedStoreMatchesSource(requestedStoreId, invoice.storeId);
    await requireSelectedStoreContext(['MANAGER', 'OWNER'], storeId);
    const payments = parsePayments(formData);
    const tillId = formString(formData, 'tillId');
    const paidAtStr = formString(formData, 'paidAt');
    const paidAt = paidAtStr ? new Date(paidAtStr) : undefined;
    const notes = formString(formData, 'notes') || undefined;
    const idempotencyKey = formString(formData, 'idempotencyKey');
    if (!idempotencyKey) {
      throw new Error('This payment form is out of date. Refresh the page or reopen the payment form, then try again.');
    }
    if (payments.some((p) => p.method === 'CASH' && p.amountPence > 0) && !tillId) {
      throw new Error(EXPLICIT_CASH_TILL_REQUIRED_MSG);
    }
    if (tillId) {
      await resolveStoreFromTill(businessId, tillId, storeId);
    }

    await recordSupplierPayment(businessId, invoiceId, payments, {
      paidAt,
      recordedByUserId: user.id,
      actorRole: user.role,
      actorName: user.name,
      notes,
      idempotencyKey,
      tillId: tillId || undefined,
    });
    revalidateTag('reports');
    revalidateOwnerDashboardCache();
    const returnTo = formString(formData, 'returnTo') || '/payments/supplier-payments';
    redirect(returnTo);
  }, '/payments/supplier-payments');
}
