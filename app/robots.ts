import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/shop/',
        disallow: ['/api/', '/settings/', '/reports/', '/pos/', '/stock/'],
      },
    ],
    sitemap: 'https://supermarket-pos-five.vercel.app/shop/sitemap.xml',
  };
}
