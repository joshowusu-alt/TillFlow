import type { MetadataRoute } from 'next';
import { getAppBaseUrl } from '@/lib/storefront-url';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppBaseUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/shop/',
        disallow: ['/api/', '/settings/', '/reports/', '/pos/', '/stock/'],
      },
    ],
    sitemap: [`${baseUrl}/sitemap.xml`, `${baseUrl}/shop/sitemap.xml`],
  };
}
