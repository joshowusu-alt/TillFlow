import { describe, expect, it } from 'vitest';

import {
  POS_LOCAL_INDEX_MAX,
  POS_OFFLINE_CATALOGUE_MAX,
  POS_SEARCH_TAKE_MAX,
  capOfflineCatalogue,
  clampPosSearchTake,
  jsonByteSize,
  resolvePosCatalogueMode,
  toSellableProductDto,
} from './sellable-dto';

describe('sellable DTO', () => {
  it('maps prisma rows without imageUrl or cost fields', () => {
    const dto = toSellableProductDto(
      {
        id: 'p1',
        name: 'Rice 5kg',
        sku: 'RICE-5',
        barcode: '111',
        sellingPriceBasePence: 4500,
        vatRateBps: 0,
        isTaxable: true,
        promoBuyQty: 0,
        promoGetQty: 0,
        category: { name: 'Staples' },
        productUnits: [
          {
            unitId: 'u1',
            conversionToBase: 1,
            isBaseUnit: true,
            sellingPricePence: 4500,
            unit: { name: 'bag', pluralName: 'bags' },
          },
        ],
      },
      12
    );

    expect(dto).toEqual({
      id: 'p1',
      name: 'Rice 5kg',
      sku: 'RICE-5',
      barcode: '111',
      sellingPriceBasePence: 4500,
      vatRateBps: 0,
      isTaxable: true,
      promoBuyQty: 0,
      promoGetQty: 0,
      categoryName: 'Staples',
      units: [
        {
          id: 'u1',
          name: 'bag',
          pluralName: 'bags',
          conversionToBase: 1,
          isBaseUnit: true,
          sellingPricePence: 4500,
        },
      ],
      onHandBase: 12,
    });
    expect(dto).not.toHaveProperty('imageUrl');
    expect(JSON.stringify(dto)).not.toContain('imageUrl');
    expect(JSON.stringify(dto)).not.toContain('defaultCost');
  });

  it('uses a local in-memory index at or below 2000 SKUs', () => {
    expect(resolvePosCatalogueMode({ productCount: 1 })).toBe('local');
    expect(resolvePosCatalogueMode({ productCount: POS_LOCAL_INDEX_MAX })).toBe('local');
    expect(resolvePosCatalogueMode({ productCount: POS_LOCAL_INDEX_MAX + 1 })).toBe('paged');
  });

  it('forces paged mode when the flag is set even for small catalogues', () => {
    expect(resolvePosCatalogueMode({ productCount: 3, posCatalogueMode: 'paged' })).toBe('paged');
    expect(resolvePosCatalogueMode({ productCount: 3, posCatalogueMode: 'local' })).toBe('local');
  });

  it('clamps search take and offline snapshot size', () => {
    expect(clampPosSearchTake(null)).toBe(12);
    expect(clampPosSearchTake('99')).toBe(POS_SEARCH_TAKE_MAX);
    expect(clampPosSearchTake('0')).toBe(12);
    expect(capOfflineCatalogue(Array.from({ length: 6000 }, (_, i) => i))).toHaveLength(
      POS_OFFLINE_CATALOGUE_MAX
    );
  });

  it('sellable JSON is smaller than a current DTO that includes imageUrl', () => {
    const sellable = toSellableProductDto(
      {
        id: 'p1',
        name: 'Rice 5kg',
        sku: 'RICE-5',
        barcode: '111',
        sellingPriceBasePence: 4500,
        vatRateBps: 0,
        isTaxable: true,
        promoBuyQty: 0,
        promoGetQty: 0,
        category: { name: 'Staples' },
        productUnits: [
          {
            unitId: 'u1',
            conversionToBase: 1,
            isBaseUnit: true,
            sellingPricePence: 4500,
            unit: { name: 'bag', pluralName: 'bags' },
          },
        ],
      },
      12
    );
    const current = {
      ...sellable,
      categoryId: 'cat-1',
      imageUrl: 'https://cdn.example.com/products/rice-5kg-hero-1200.webp?w=800&q=80',
      units: sellable.units.map((unit) => ({ ...unit, defaultCostPence: 3000 })),
    };
    expect(jsonByteSize(sellable)).toBeLessThan(jsonByteSize(current));
  });
});
