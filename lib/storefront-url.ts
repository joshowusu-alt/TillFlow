function normalizeBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.hostname === 'vercel.com' || url.hostname === 'www.vercel.com') {
      return null;
    }
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Resolve the absolute base URL for customer-facing storefront links.
 * Uses an explicit app URL first, then Vercel's production alias, then the
 * current request origin, and only then a per-deployment Vercel URL.
 */
export function getAppBaseUrl(requestOrigin?: string | null): string {
  const explicit =
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeBaseUrl(process.env.APP_URL);
  if (explicit) return explicit;

  const production = normalizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (production) return production;

  const origin = normalizeBaseUrl(requestOrigin);
  if (origin) return origin;

  const vercel = normalizeBaseUrl(process.env.VERCEL_URL);
  if (vercel) return vercel;

  return 'http://localhost:3000';
}

export function buildStorefrontUrl(slug: string | null | undefined, requestOrigin?: string | null): string | null {
  if (!slug) return null;
  return `${getAppBaseUrl(requestOrigin)}/shop/${slug}`;
}
