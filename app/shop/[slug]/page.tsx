import { notFound } from 'next/navigation';
import StorefrontClient from './StorefrontClient';
import { getPublicStorefrontBySlug } from '@/lib/services/online-orders';

export const dynamic = 'force-dynamic';

export default async function StorefrontPage({ params }: { params: { slug: string } }) {
  const storefront = await getPublicStorefrontBySlug(params.slug);
  if (!storefront) {
    notFound();
  }

  return <StorefrontClient storefront={storefront} />;
}
