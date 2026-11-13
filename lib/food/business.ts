import { PRODUCT_CREATE_HREF } from '@/lib/products/product-create-href';

/** Existing onboarding category for chop bars and other food businesses. */
export const FOOD_BUSINESS_CATEGORY = 'RESTAURANT_STOCK';

export const DISH_SETUP_HREF = '/products/dishes/new';

/**
 * Food behaviour is allowed only when the business was explicitly set to the
 * food category. Supermarket, bookshop and every other category stay on the
 * single-price product path.
 */
export function isFoodBusiness(category: string | null | undefined): boolean {
  return category === FOOD_BUSINESS_CATEGORY;
}

export function manualCatalogueHref(category: string | null | undefined): string {
  return isFoodBusiness(category) ? DISH_SETUP_HREF : PRODUCT_CREATE_HREF;
}

export function manualCatalogueLabel(category: string | null | undefined): string {
  return isFoodBusiness(category) ? 'Add a dish' : 'Add a product manually';
}
