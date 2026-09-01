/**
 * Canonical new-product destination. Must stay a list-route hash, never a
 * product-detail id. `/products/[id]` renders “Product not found.” for unknown ids.
 */
export const PRODUCT_CREATE_HASH = 'product-create';
export const PRODUCT_CREATE_PATHNAME = '/products';
export const PRODUCT_CREATE_HREF = `${PRODUCT_CREATE_PATHNAME}#${PRODUCT_CREATE_HASH}`;
export const PRODUCT_CREATE_FAULTY_DETAIL_PATH = `${PRODUCT_CREATE_PATHNAME}/${PRODUCT_CREATE_HASH}`;
export const PRODUCT_NOT_FOUND_COPY = 'Product not found.';
export const ONBOARDING_ADD_PRODUCT_MANUALLY_NAME = 'Add a product manually';
export const ONBOARDING_ADD_PRODUCT_MANUALLY_TESTID = 'onboarding-add-product-manually';

export function parseAppUrl(url: string) {
  return new URL(url, 'https://tillflow.local');
}

export function isExactProductCreateDestination(url: string) {
  const parsed = parseAppUrl(url);
  return parsed.pathname === PRODUCT_CREATE_PATHNAME && parsed.hash === `#${PRODUCT_CREATE_HASH}`;
}

export function isFaultyProductCreateDetailPath(url: string) {
  return parseAppUrl(url).pathname === PRODUCT_CREATE_FAULTY_DETAIL_PATH;
}

/**
 * Next.js App Router Link click uses `new URL(href, location.href)` after
 * preventDefault. A hash href resolved against a trailing-slash products URL
 * can become `/products/product-create` and hit the [id] not-found page.
 */
export function resolveAppRouterHref(href: string, locationHref: string) {
  return new URL(href, locationHref);
}
