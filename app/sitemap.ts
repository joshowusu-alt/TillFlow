import type { MetadataRoute } from 'next';
import { getTillflowSiteOrigin } from '@/lib/marketing/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getTillflowSiteOrigin();
  const lastModified = new Date();

  return [
    { url: `${base}/welcome`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/demo`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/register`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
  ];
}
