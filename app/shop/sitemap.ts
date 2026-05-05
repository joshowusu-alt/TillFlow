import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { getAppBaseUrl } from '@/lib/storefront-url';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAppBaseUrl();
  const storefronts = await prisma.business.findMany({
    where: {
      storefrontEnabled: true,
      storefrontSlug: { not: null },
    },
    select: {
      storefrontSlug: true,
      updatedAt: true,
    },
  });

  return storefronts
    .filter((storefront): storefront is { storefrontSlug: string; updatedAt: Date } => Boolean(storefront.storefrontSlug))
    .map((storefront) => ({
      url: `${baseUrl}/shop/${storefront.storefrontSlug}`,
      lastModified: storefront.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));
}
