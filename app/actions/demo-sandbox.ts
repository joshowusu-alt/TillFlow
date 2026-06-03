'use server';

import { revalidatePath } from 'next/cache';
import { resetAdomRetailDemoCatalogue } from '@/lib/demo-sandbox/reset';
import { seedAdomRetailDemoBusiness } from '@/lib/demo-sandbox/seed';

/** Control/cron only — requires CRON_SECRET or ALLOW_SEED in production. */
export async function refreshAdomRetailDemoAction(secret?: string) {
  const expected = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (process.env.ALLOW_SEED !== 'true' && (!expected || secret !== expected)) {
      return { ok: false as const, error: 'Unauthorized' };
    }
  }

  await resetAdomRetailDemoCatalogue();
  const { businessId } = await seedAdomRetailDemoBusiness();
  revalidatePath('/shop/adom-retail-demo');
  return { ok: true as const, businessId };
}
