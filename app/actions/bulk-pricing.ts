'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withBusinessContext, safeAction, ok, UserError } from '@/lib/action-utils';
import { previewBulkPricing, applyBulkPricing } from '@/lib/services/bulk-pricing';
import { BulkPricingError } from '@/lib/products/bulk-pricing';
import { revalidatePosCatalog } from '@/lib/cache/pos-tags';

export async function previewBulkPricingAction(input: unknown) {
  return safeAction(async () => {
    const { businessId } = await withBusinessContext(['OWNER', 'MANAGER'], { requireWrite: false });
    try { return ok(await previewBulkPricing(businessId, input)); }
    catch (error) { if (error instanceof BulkPricingError) throw new UserError(error.message); throw error; }
  });
}

export async function applyBulkPricingAction(request: Parameters<typeof applyBulkPricing>[1]) {
  return safeAction(async () => {
    const { businessId, user } = await withBusinessContext(['OWNER', 'MANAGER']);
    try {
      const result = await applyBulkPricing({ businessId, id: user.id, name: user.name, role: user.role }, request);
      revalidatePosCatalog(businessId);
      revalidatePath('/products');
      revalidatePath('/products/[id]', 'page');
      revalidatePath('/products/labels');
      return ok(result);
    } catch (error) { if (error instanceof BulkPricingError) throw new UserError(error.message); throw error; }
  });
}

export async function submitBulkPricingAction(request: Parameters<typeof applyBulkPricing>[1]): Promise<Awaited<ReturnType<typeof applyBulkPricingAction>>> {
  const result = await applyBulkPricingAction(request);
  if (result.success) redirect(`/products/bulk-pricing?batch=${encodeURIComponent(result.data.batchId)}`);
  return result;
}
