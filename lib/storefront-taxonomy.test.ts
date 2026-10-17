import { expect, it } from 'vitest';
import { normalizePublicCategoryName, resolvePublicCategory, buildCategoryMappingLookup } from './storefront-taxonomy';
it.each([
  ['MILK','Dairy & eggs'], ['GARI','Rice & staples'], ['CEREAL','Breakfast & cereal'],
  ['PERSONAL CARE','Toiletries'], ['AIR FRESHENER','Air freshener'],
  ['BABY OIL','Baby & infant'], ['BABY CREAM','Baby & infant'], ['ROLL-ON','Toiletries'],
  ['TOOTH PASTE','Oral care'], ['TOOTH BRUSH','Oral care'], ['TOILET ROLL','Paper & disposables'],
  ['CORN FLAKES','Breakfast & cereal'], ['MILK POWDER','Dairy & eggs'], ['TOFFEE','Sweets & confectionery'],
  ['BISCUIT','Biscuits & snacks'], ['BUSCUIT','Biscuits & snacks'], ['BISCUITS','Biscuits & snacks'],
])('maps %s without substring collisions', (raw, expected) => {
  expect(normalizePublicCategoryName(raw).name).toBe(expected);
});
it('preserves a merchant override ahead of automatic category defaults', () => {
  const lookup=buildCategoryMappingLookup([{rawCategoryName:'BABY OIL',publicCategoryName:'Baby care',priority:1}]);
  expect(resolvePublicCategory('BABY OIL',lookup).name).toBe('Baby care');
});
