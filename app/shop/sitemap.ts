import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
      url: `https://supermarket-pos-five.vercel.app/shop/${storefront.storefrontSlug}`,
      lastModified: storefront.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    }));
}
