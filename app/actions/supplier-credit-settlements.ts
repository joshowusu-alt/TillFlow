'use server';
import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { formAction, requireSelectedStoreContext, UserError } from '@/lib/action-utils';
import { settleSupplierCredit } from '@/lib/services/supplier-credit-settlements';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';

export async function settleSupplierCreditAction(data: FormData) {
  const sourceInvoiceId = String(data.get('sourceInvoiceId') ?? '');
  const path = `/purchases/credit-settlement/${encodeURIComponent(sourceInvoiceId)}`;
  return formAction(async () => {
    const ctx = await requireSelectedStoreContext(['OWNER', 'MANAGER'], String(data.get('storeId') ?? ''));
    const raw = String(data.get('amount') ?? '').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new UserError('Enter an amount with no more than two decimal places.');
    const kind = String(data.get('kind'));
    if (!['OFFSET', 'REFUND_BANK', 'REFUND_CASH'].includes(kind)) throw new UserError('Choose how this credit was settled.');
    if (data.get('confirmed') !== 'on') throw new UserError('Confirm the supplier agreed the offset or the refund was received.');
    await settleSupplierCredit({ businessId: ctx.businessId, storeId: ctx.storeId, userId: ctx.user.id, sourceInvoiceId, kind: kind as 'OFFSET' | 'REFUND_BANK' | 'REFUND_CASH', amountPence: Math.round(Number(raw) * 100), reference: String(data.get('reference') ?? ''), requestKey: String(data.get('requestKey') ?? ''), ...(kind === 'OFFSET' ? { targetInvoiceId: String(data.get('targetInvoiceId') ?? '') } : {}), ...(kind === 'REFUND_CASH' ? { tillId: String(data.get('tillId') ?? '') } : {}) });
    revalidateTag('reports');
    revalidateOwnerDashboardCache();
    for (const route of ['/purchases', '/payments', '/payments/supplier-payments', '/suppliers', '/reports', '/shifts']) revalidatePath(route, 'layout');
    revalidatePath('/purchases/partial-return/[id]', 'page');
    redirect(`${path}?saved=1`);
  }, path);
}
