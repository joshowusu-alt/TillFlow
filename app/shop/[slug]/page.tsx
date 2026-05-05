import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import StorefrontClient from './StorefrontClient';
import { getPublicStorefrontBySlug } from '@/lib/services/online-orders';
import { getStorefrontSessionCustomer } from '@/lib/services/storefront-customers';
import { getAppBaseUrl } from '@/lib/storefront-url';

export const dynamic = 'force-dynamic';

type StorefrontPageProps = {
  params: { slug: string };
};

function getRequestOrigin() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'https';
  return host ? `${protocol}://${host}` : null;
}

export async function generateMetadata({ params }: StorefrontPageProps): Promise<Metadata> {
  const storefront = await getPublicStorefrontBySlug(params.slug);
  if (!storefront) {
    return { title: 'Store not found' };
  }

  const baseUrl = getAppBaseUrl(getRequestOrigin());
  const title = `${storefront.name} — Online Shop`;
  const description =
    storefront.branding.tagline ??
    storefront.description ??
    `Browse and order from ${storefront.name} online. Fast pickup available.`;
  const url = `${baseUrl}/shop/${params.slug}`;
  const ogImage = storefront.branding.logoUrl ?? `${baseUrl}/og-default-store`;

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

  const customer = await getStorefrontSessionCustomer(params.slug);
  const baseUrl = getAppBaseUrl(getRequestOrigin());

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: storefront.name,
    url: `${baseUrl}/shop/${params.slug}`,
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
      <StorefrontClient
        storefront={storefront}
        customer={
          customer
            ? { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email }
            : null
        }
      />
    </>
  );
}
