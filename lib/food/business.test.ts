import { describe, expect, it } from 'vitest';
import { PRODUCT_CREATE_HREF } from '@/lib/products/product-create-href';
import {
  DISH_SETUP_HREF,
  isFoodBusiness,
  manualCatalogueHref,
  manualCatalogueLabel,
} from '@/lib/food/business';

describe('food business gate', () => {
  it('turns food behaviour on only for the food category', () => {
    expect(isFoodBusiness('RESTAURANT_STOCK')).toBe(true);
    expect(isFoodBusiness('SUPERMARKET')).toBe(false);
    expect(isFoodBusiness('OTHER')).toBe(false);
    expect(isFoodBusiness(null)).toBe(false);
    expect(isFoodBusiness('restaurant_stock')).toBe(false);
  });

  it('sends a new food business to dish setup and leaves retail and bookshop on the product form', () => {
    expect(manualCatalogueHref('RESTAURANT_STOCK')).toBe(DISH_SETUP_HREF);
    expect(manualCatalogueLabel('RESTAURANT_STOCK')).toBe('Add a dish');
    expect(manualCatalogueHref('SUPERMARKET')).toBe(PRODUCT_CREATE_HREF);
    expect(manualCatalogueHref('OTHER')).toBe(PRODUCT_CREATE_HREF);
    expect(manualCatalogueLabel('SUPERMARKET')).toBe('Add a product manually');
    expect(manualCatalogueLabel('OTHER')).toBe('Add a product manually');
  });
});
