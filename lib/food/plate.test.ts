import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/lib/format';
import {
  applyFoodSaleLines,
  defaultPlateSelection,
  dishNeedsPicker,
  formatPlateDetail,
  cheapestActiveSizePricePence,
  formatDishListPrice,
  menuListPricePence,
  onlineHoldQty,
  plateSelectionKey,
  pricePlate,
  type FoodMenu,
  type PlateSnapshot,
} from '@/lib/food/plate';
import { foodAvailability } from '@/lib/food/availability';
import { isFoodBusiness } from '@/lib/food/business';

const banku: FoodMenu = {
  productId: 'banku',
  name: 'Banku',
  stockMode: 'COUNTED',
  soldOut: false,
  lowAt: 3,
  sizes: [],
  inclusions: [
    { id: 'bowl', name: 'bowl of banku', qty: 1, stockPortions: 1 },
  ],
  groups: [
    {
      id: 'extras',
      name: 'Extras',
      selection: 'MANY',
      required: false,
      addons: [
        { id: 'extra-banku', name: 'extra banku', pricePence: 500, maxQty: 3, stockPortions: 1 },
        { id: 'pepper', name: 'pepper', pricePence: 200, maxQty: 2, stockPortions: 0 },
      ],
    },
  ],
};

const jollof: FoodMenu = {
  productId: 'jollof',
  name: 'Jollof',
  stockMode: 'NOT_COUNTED',
  soldOut: false,
  lowAt: 0,
  sizes: [
    { id: 'small', name: 'Small', pricePence: 2000, isDefault: false },
    { id: 'medium', name: 'Medium', pricePence: 3000, isDefault: true },
    { id: 'large', name: 'Large', pricePence: 4000, isDefault: false },
  ],
  inclusions: [{ id: 'rice', name: 'jollof rice', qty: 1, stockPortions: 1 }],
  groups: [
    {
      id: 'protein',
      name: 'Protein',
      selection: 'SINGLE',
      required: true,
      addons: [
        { id: 'chicken', name: 'chicken', pricePence: 1500, maxQty: 1, stockPortions: 0 },
        { id: 'goat', name: 'goat', pricePence: 2000, maxQty: 1, stockPortions: 0 },
        { id: 'turkey', name: 'turkey', pricePence: 1800, maxQty: 1, stockPortions: 0 },
      ],
    },
  ],
};

describe('plate price', () => {
  it('prices a Banku plate with the included bowl and an extra bowl', () => {
    const plate = pricePlate(
      banku,
      { addons: [{ addonId: 'extra-banku', qty: 1 }] },
      2500,
    );
    expect(plate.platePricePence).toBe(3000);
    expect(plate.inclusions).toEqual([{ name: 'bowl of banku', qty: 1 }]);
    expect(plate.addons).toEqual([
      expect.objectContaining({ name: 'extra banku', qty: 1, unitPricePence: 500, linePricePence: 500 }),
    ]);
    expect(plate.stockPortions).toBe(2);
    expect(formatPlateDetail(plate, (pence) => formatMoney(pence))).toContain('Includes 1 bowl of banku');
    expect(formatPlateDetail(plate, (pence) => formatMoney(pence))).toContain('+ 1 extra banku');
    expect(formatPlateDetail(plate, (pence) => formatMoney(pence))).toContain('GH₵5.00');
  });

  it('uses the chosen size price, not the starting price, and keeps a default size', () => {
    expect(menuListPricePence(jollof, 1500)).toBe(3000);
    expect(cheapestActiveSizePricePence(jollof)).toBe(2000);
    expect(formatDishListPrice(jollof, 1500, (pence) => formatMoney(pence))).toBe('from GH₵20.00');
    expect(formatDishListPrice(banku, 2500, (pence) => formatMoney(pence))).toBe('GH₵25.00');
    expect(dishNeedsPicker(jollof)).toBe(true);
    const plate = pricePlate(
      jollof,
      { sizeId: 'large', addons: [{ addonId: 'goat', qty: 1 }] },
      1500,
    );
    expect(plate.sizeName).toBe('Large');
    expect(plate.platePricePence).toBe(6000);
    expect(plate.stockPortions).toBe(0);
    expect(pricePlate(jollof, { addons: [{ addonId: 'chicken', qty: 1 }] }, 1500).sizeName).toBe('Medium');
  });

  it('rejects a second protein in a single-choice group and a missing required choice', () => {
    expect(() =>
      pricePlate(jollof, { sizeId: 'small', addons: [{ addonId: 'chicken', qty: 1 }, { addonId: 'goat', qty: 1 }] }, 1500),
    ).toThrow(/only one Protein/i);
    expect(() => pricePlate(jollof, { sizeId: 'small', addons: [] }, 1500)).toThrow(/Choose one Protein/i);
  });

  it('ignores a client price and rejects a stale displayed price', () => {
    const cheated = pricePlate(
      banku,
      { addons: [{ addonId: 'extra-banku', qty: 1 }], expectedPricePence: 3000 },
      2500,
    );
    expect(cheated.platePricePence).toBe(3000);
    expect(() =>
      pricePlate(banku, { addons: [{ addonId: 'extra-banku', qty: 1 }], expectedPricePence: 100 }, 2500),
    ).toThrow(/price of this Banku plate changed/i);
  });

  it('allows pepper that does not take another portion, and caps the extra bowl', () => {
    const plate = pricePlate(
      banku,
      { addons: [{ addonId: 'pepper', qty: 2 }, { addonId: 'extra-banku', qty: 1 }] },
      2500,
    );
    expect(plate.platePricePence).toBe(3400);
    expect(plate.stockPortions).toBe(2);
    expect(() => pricePlate(banku, { addons: [{ addonId: 'extra-banku', qty: 4 }] }, 2500)).toThrow(/limited to 3/);
  });
});

describe('counted and not-counted dishes', () => {
  it('switches a not-counted dish off without using a portion count', () => {
    expect(foodAvailability(jollof, 0)).toBe('available');
    expect(foodAvailability({ ...jollof, soldOut: true }, 99)).toBe('sold_out');
    expect(() => pricePlate({ ...jollof, soldOut: true }, { addons: [{ addonId: 'chicken', qty: 1 }] }, 1500)).toThrow(/sold out/i);
    const sold = pricePlate(jollof, { addons: [{ addonId: 'chicken', qty: 1 }] }, 1500);
    expect(onlineHoldQty(sold, 2)).toBe(0);
  });

  it('warns when a counted dish is low or sold out and holds every portion used', () => {
    expect(foodAvailability(banku, 0)).toBe('sold_out');
    expect(foodAvailability(banku, 3)).toBe('low');
    expect(foodAvailability(banku, 4)).toBe('available');
    const plain = pricePlate(banku, defaultPlateSelection(banku), 2500);
    const extra = pricePlate(banku, { addons: [{ addonId: 'extra-banku', qty: 1 }] }, 2500);
    expect(onlineHoldQty(plain, 1)).toBe(1);
    expect(onlineHoldQty(extra, 1)).toBe(2);
    expect(onlineHoldQty(plain, 1) + onlineHoldQty(extra, 1)).toBe(3);
    expect(onlineHoldQty(plain, 5)).toBe(5);
  });

  it('counts a plate as one portion when nothing on it is marked as counted stock', () => {
    const plates: FoodMenu = {
      ...banku,
      inclusions: [{ id: 'bowl', name: 'bowl of banku', qty: 1, stockPortions: 0 }],
    };
    expect(pricePlate(plates, { addons: [] }, 2500).stockPortions).toBe(1);
    expect(pricePlate(plates, { addons: [{ addonId: 'extra-banku', qty: 1 }] }, 2500).stockPortions).toBe(2);
  });
});

describe('retail and bookshop sales stay on the catalogue price', () => {
  const menus = new Map<string, FoodMenu>([['banku', banku]]);
  const prices = new Map([['banku', 2500]]);
  const lines = [
    {
      productId: 'banku',
      qtyInUnit: 1,
      unitPricePence: 500,
      lineSubtotalPence: 500,
      qtyBase: 1,
      plate: { sizeId: null, addons: [{ addonId: 'extra-banku', qty: 1 }], expectedPricePence: 100 },
    },
  ];

  it.each(['SUPERMARKET', 'OTHER', 'MINI_MART', null, ''])(
    'does not reprice %s',
    (category) => {
      expect(isFoodBusiness(category)).toBe(false);
      const priced = applyFoodSaleLines(category, lines, menus, prices);
      expect(priced).toBe(lines);
      expect(priced[0].unitPricePence).toBe(500);
      expect(priced[0].lineSubtotalPence).toBe(500);
      expect(priced[0].qtyBase).toBe(1);
    },
  );

  it('recomputes the same dish for a food business and drops the client price', () => {
    const priced = applyFoodSaleLines('FOOD_DISHES', [{ ...lines[0], plate: { addons: [{ addonId: 'extra-banku', qty: 1 }] } }], menus, prices);
    expect(priced).not.toBe(lines);
    expect(priced[0].unitPricePence).toBe(3000);
    expect(priced[0].lineSubtotalPence).toBe(3000);
    expect(priced[0].qtyBase).toBe(2);
    const snapshot = JSON.parse((priced[0] as unknown as { plateSnapshotJson: string }).plateSnapshotJson) as PlateSnapshot;
    expect(snapshot.dishName).toBe('Banku');
    expect(snapshot.addons[0].name).toBe('extra banku');
    expect(snapshot.platePricePence).toBe(3000);
  });

  it('leaves a normal product inside a food business on its catalogue price', () => {
    const water = [{ productId: 'water', qtyInUnit: 2, unitPricePence: 300, lineSubtotalPence: 600, qtyBase: 2 }];
    expect(applyFoodSaleLines('FOOD_DISHES', water, menus, prices)).toEqual(water);
  });

  it('two different plates do not collapse into one selection', () => {
    const plain = plateSelectionKey(defaultPlateSelection(banku));
    const extra = plateSelectionKey({ addons: [{ addonId: 'extra-banku', qty: 1 }] });
    expect(plain).not.toBe(extra);
  });
});
