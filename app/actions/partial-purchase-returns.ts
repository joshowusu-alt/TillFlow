'use server';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { formAction, requireSelectedStoreContext } from '@/lib/action-utils';
import { createPartialPurchaseReturn } from '@/lib/services/partial-purchase-returns';
import { revalidatePosCatalog } from '@/lib/cache/pos-tags';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';

export async function recordPartialPurchaseReturnAction(data: FormData) {
  const invoiceId = String(data.get('invoiceId') ?? '');
  return formAction(async () => {
    const ctx = await requireSelectedStoreContext(['MANAGER', 'OWNER'], String(data.get('storeId') ?? ''));
    const lines = [...data.entries()].filter(([key, value]) => key.startsWith('qty:') && String(value).trim() !== '' && String(value) !== '0').map(([key, value]) => ({ lineId: key.slice(4), qtyBase: Number(value) }));
    await createPartialPurchaseReturn({ businessId: ctx.businessId, storeId: ctx.storeId, invoiceId, userId: ctx.user.id, requestKey: String(data.get('requestKey') ?? randomUUID()), reason: String(data.get('reason') ?? ''), kind: data.get('kind') === 'SHORT_DELIVERY_CREDIT' ? 'SHORT_DELIVERY_CREDIT' : 'RETURN', lines });
    revalidatePosCatalog(ctx.businessId, ctx.storeId);
    revalidateTag('reports');
    revalidateOwnerDashboardCache();
    for (const route of ['/purchases', `/purchases/${invoiceId}`, '/inventory', '/suppliers', '/reports']) revalidatePath(route);
    redirect(`/purchases/partial-return/${encodeURIComponent(invoiceId)}?saved=1`);
  }, `/purchases/partial-return/${encodeURIComponent(invoiceId)}`);
}
