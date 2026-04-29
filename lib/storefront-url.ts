/**
 * Resolve the absolute base URL for customer-facing storefront links.
 * Prefers NEXT_PUBLIC_APP_URL (explicit configured value), falls back to the
 * Vercel-supplied URL, then to localhost during dev.
 */
export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;
  return 'http://localhost:3000';
}

export function buildStorefrontUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `${getAppBaseUrl()}/shop/${slug}`;
}
