import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import StorefrontClient from './StorefrontClient';
import { getPublicStorefrontBySlug } from '@/lib/services/online-orders';

export const dynamic = 'force-dynamic';

const SHOP_BASE_URL = 'https://supermarket-pos-five.vercel.app';

type StorefrontPageProps = {
  params: { slug: string };
};

export async function generateMetadata({ params }: StorefrontPageProps): Promise<Metadata> {
  const storefront = await getPublicStorefrontBySlug(params.slug);
  if (!storefront) {
    return { title: 'Store not found' };
  }

  const title = `${storefront.name} — Online Shop`;
  const description =
    storefront.branding.tagline ??
    storefront.description ??
    `Browse and order from ${storefront.name} online. Fast pickup available.`;
  const url = `${SHOP_BASE_URL}/shop/${params.slug}`;
  const ogImage = storefront.branding.logoUrl ?? '/og-default-store.png';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: 'TillFlow',
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: 'website',
      locale: 'en_GH',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    alternates: { canonical: url },
    robots: { index: true, follow: true },
  };
}

export default async function StorefrontPage({ params }: StorefrontPageProps) {
  const storefront = await getPublicStorefrontBySlug(params.slug);
  if (!storefront) {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: storefront.name,
    url: `${SHOP_BASE_URL}/shop/${params.slug}`,
    telephone: storefront.phone ?? undefined,
    address: storefront.address
      ? {
          '@type': 'PostalAddress',
          addressLocality: storefront.address,
          addressCountry: 'GH',
        }
      : undefined,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `${storefront.name} Products`,
      itemListElement: storefront.products.slice(0, 20).map((product, index) => {
        const firstUnit = product.units[0];
        const pricePence =
          firstUnit?.sellingPricePence ??
          product.sellingPriceBasePence * (firstUnit?.conversionToBase ?? 1);

        return {
          '@type': 'Offer',
          position: index + 1,
          itemOffered: {
            '@type': 'Product',
            name: product.name,
            image: product.imageUrl ?? undefined,
            description: product.storefrontDescription ?? product.categoryName ?? undefined,
            offers: {
              '@type': 'Offer',
              priceCurrency: storefront.currency,
              price: (pricePence / 100).toFixed(2),
              availability:
                product.onHandBase > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            },
          },
        };
      }),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <StorefrontClient storefront={storefront} />
    </>
  );
}
