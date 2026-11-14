import { expect, it } from 'vitest';
import { posBarcodeWhere, posSearchWhere } from './catalogue-query';

it('filters ingredients from both name search and barcode lookup', () => {
  expect(posSearchWhere('business', 'Rice')).toMatchObject({ businessId: 'business', ingredientOnly: false });
  expect(posBarcodeWhere('business', '1234')).toMatchObject({ businessId: 'business', ingredientOnly: false });
});
