import type { Metadata } from 'next';

export const TILLFLOW_SITE_TITLE = 'TillFlow — Complete Control for Ghanaian Retail';

export const TILLFLOW_SITE_DESCRIPTION =
  'Complete control over your business. Know before you count — expected cash, stock, MoMo and closing confidence for Ghanaian retail owners.';

export const TILLFLOW_CANONICAL_WELCOME = 'https://www.tillflow.app/welcome';

export const TILLFLOW_OG_IMAGE_PATH = '/og/tillflow-og-v2.png';

export const TILLFLOW_OG_IMAGE_WIDTH = 1200;

export const TILLFLOW_OG_IMAGE_HEIGHT = 630;

function resolveSiteOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    'https://www.tillflow.app';

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    return 'https://www.tillflow.app';
  }
}

export function getTillflowSiteOrigin(): string {
  return resolveSiteOrigin();
}

export function getTillflowOgImageUrl(): string {
  return `${getTillflowSiteOrigin()}${TILLFLOW_OG_IMAGE_PATH}`;
}

type PublicMetadataOptions = {
  title?: string;
  description?: string;
  canonicalPath?: string;
  noIndex?: boolean;
};

export function buildTillflowPublicMetadata(options: PublicMetadataOptions = {}): Metadata {
  const origin = getTillflowSiteOrigin();
  const title = options.title ?? TILLFLOW_SITE_TITLE;
  const description = options.description ?? TILLFLOW_SITE_DESCRIPTION;
  const canonicalPath = options.canonicalPath ?? '/welcome';
  const canonical = `${origin}${canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`}`;
  const ogImage = getTillflowOgImageUrl();

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: options.noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: 'website',
      url: canonical,
      title,
      description,
      siteName: 'TillFlow',
      locale: 'en_GH',
      images: [
        {
          url: ogImage,
          width: TILLFLOW_OG_IMAGE_WIDTH,
          height: TILLFLOW_OG_IMAGE_HEIGHT,
          alt: 'TillFlow — complete business control for Ghanaian retail',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}
