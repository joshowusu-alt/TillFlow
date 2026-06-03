import { prisma } from '@/lib/prisma';
import { ADOM_RETAIL_DEMO_SLUG, DEMO_SANDBOX_QA_TAG } from './constants';

/** Remove sandbox-tagged catalogue rows for the demo business (storefront refresh). */
export async function resetAdomRetailDemoCatalogue(): Promise<{ deletedProducts: number }> {
  const business = await prisma.business.findFirst({
    where: { storefrontSlug: ADOM_RETAIL_DEMO_SLUG, isDemo: true },
    select: { id: true },
  });
  if (!business) return { deletedProducts: 0 };

  const result = await prisma.product.deleteMany({
    where: { businessId: business.id, qaTag: DEMO_SANDBOX_QA_TAG },
  });

  return { deletedProducts: result.count };
}
