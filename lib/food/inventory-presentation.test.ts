import { describe, expect, it } from 'vitest';
import { inventoryAvailability } from '@/lib/food/inventory-presentation';

describe('kitchen inventory availability', () => {
  const dish = { stockMode: 'NOT_COUNTED', soldOut: false, lowAt: 2 };

  it('ignores retail stock thresholds for uncounted dishes and respects the sold-out toggle', () => {
    expect(inventoryAvailability('FOOD_DISHES', dish, 0, 10)).toMatchObject({
      dish: true, isOut: false, isLow: false, status: 'Available', quantity: 'Portions not counted',
    });
    expect(inventoryAvailability('FOOD_DISHES', { ...dish, soldOut: true }, 5, 10)).toMatchObject({
      status: 'Sold out', isOut: true,
    });
  });

  it('uses the portion count and kitchen threshold for counted dishes', () => {
    const counted = { ...dish, stockMode: 'COUNTED' };
    expect(inventoryAvailability('FOOD_DISHES', counted, 0, 0)).toMatchObject({ status: 'Sold out', isOut: true });
    expect(inventoryAvailability('FOOD_DISHES', counted, 2, 0)).toMatchObject({
      status: 'Low portions', isLow: true, quantity: '2 portions left',
    });
    expect(inventoryAvailability('FOOD_DISHES', counted, 3, 10)).toMatchObject({
      status: 'Available', isLow: false, quantity: '3 portions left',
    });
  });

  it('keeps purchased stock and retail catalogue rows on existing thresholds', () => {
    expect(inventoryAvailability('FOOD_DISHES', null, 1, 3)).toMatchObject({ dish: false, status: 'Low stock' });
    expect(inventoryAvailability('SUPERMARKET', dish, 0, 3)).toMatchObject({ dish: false, status: 'Out of stock' });
    expect(inventoryAvailability('SUPERMARKET', null, 5, 3)).toMatchObject({ dish: false, status: 'OK' });
  });
});
