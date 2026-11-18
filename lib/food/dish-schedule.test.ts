import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyDishDraft, normalizeDishDraft } from './dish-draft';
import { dishDaysLabel, isDishAvailableToday } from './dish-schedule';
import { foodAvailabilityText, sellableBaseQty } from './availability';
import { loadFoodCatalogue } from './load-menus';
import type { FoodMenu } from './plate';
import { priceFoodSaleLines, repriceFoodCheckoutLines } from './price-sale';

vi.mock('./load-menus', () => ({ loadFoodCatalogue: vi.fn() }));

const saturday = new Date('2026-11-21T00:00:00Z');
const friday = new Date(saturday.getTime() - 1);
const monday = new Date('2026-11-23T00:00:00Z');
const dish: FoodMenu = {
  productId: 'fufu', name: 'Fufu', stockMode: 'NOT_COUNTED', lowAt: 0, soldOut: false,
  availableDays: ['Sat', 'Sun'], sizes: [], inclusions: [], groups: [],
};
const line = {
  productId: 'fufu', qtyInUnit: 1, qtyBase: 0, unitPricePence: 3500,
  lineSubtotalPence: 3500, lineVatPence: 0, lineTotalPence: 3500,
};
const checkout = {
  businessId: 'food', businessCategory: 'FOOD_DISHES', vatEnabled: false,
  vatRateByProduct: new Map<string, number>(), lines: [line], plates: [],
};

afterEach(() => vi.useRealTimers());

describe('dish availability by day', () => {
  it('switches at business midnight and uses Accra by default', () => {
    expect(isDishAvailableToday(dish, friday)).toBe(false);
    expect(isDishAvailableToday(dish, saturday)).toBe(true);
    expect(isDishAvailableToday(dish, monday)).toBe(false);
    expect(isDishAvailableToday(dish, saturday, 'America/New_York')).toBe(false);
    expect(isDishAvailableToday(dish, friday, 'Africa/Lagos')).toBe(true);
  });

  it('keeps legacy dishes available every day and labels scheduled dishes only', () => {
    for (const availableDays of [undefined, null, []]) {
      expect(isDishAvailableToday({ availableDays }, monday)).toBe(true);
    }
    expect(dishDaysLabel('')).toBeNull();
    expect(dishDaysLabel('Mon,Tue,Wed,Thu,Fri,Sat,Sun')).toBeNull();
    expect(dishDaysLabel('Sat,Sun')).toBe('Sat, Sun');
  });

  it('requires at least one chosen day when saving a dish', () => {
    const draft = { ...emptyDishDraft(), name: 'Fufu', startingPriceCedis: '35' };
    expect(normalizeDishDraft(draft).availableDays).toBeNull();
    expect(normalizeDishDraft({ ...draft, availableDays: ['Sun', 'Sat'] }).availableDays).toBe('Sat,Sun');
    expect(() => normalizeDishDraft({ ...draft, availableDays: [] })).toThrow('Choose at least one day.');
  });

  it('greys out an off-day dish and keeps Sold out on scheduled days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(friday);
    expect(foodAvailabilityText(dish, 0)).toBe('Not today');
    expect(sellableBaseQty(dish, 20)).toBe(0);
    vi.setSystemTime(saturday);
    expect(foodAvailabilityText({ ...dish, soldOut: true }, 20)).toBe('Sold out');
    expect(sellableBaseQty({ ...dish, soldOut: true }, 20)).toBe(0);
  });

  it('refuses live till and online sales on an off-day and checks offline by the captured date', async () => {
    vi.mocked(loadFoodCatalogue).mockResolvedValue({
      menus: new Map([['fufu', dish]]), startingPrices: new Map([['fufu', 3500]]),
      inactiveProductIds: new Set(),
    });
    vi.useFakeTimers();
    vi.setSystemTime(friday);
    await expect(priceFoodSaleLines('food', [line])).rejects.toThrow('Fufu is not available');
    await expect(repriceFoodCheckoutLines(checkout)).rejects.toThrow('Fufu is not available today.');
    await expect(priceFoodSaleLines('food', [line], saturday)).resolves.toMatchObject([line]);
    await expect(priceFoodSaleLines('food', [line], null)).rejects.toThrow('The sale time is needed');

    vi.setSystemTime(saturday);
    await expect(priceFoodSaleLines('food', [line], friday)).rejects.toThrow('Fufu is not available');
    await expect(repriceFoodCheckoutLines(checkout)).resolves.toMatchObject([line]);
  });

  it('refuses removed dishes at the live till, on replay and at online checkout, then allows restoration', async () => {
    const inactiveProductIds = new Set(['fufu']);
    vi.mocked(loadFoodCatalogue).mockResolvedValue({
      menus: new Map([['fufu', { ...dish, availableDays: [] }]]),
      startingPrices: new Map([['fufu', 3500]]), inactiveProductIds,
    });
    await expect(priceFoodSaleLines('food', [line])).rejects.toThrow('Fufu is no longer on the menu.');
    await expect(priceFoodSaleLines('food', [line], saturday)).rejects.toThrow('Fufu is no longer on the menu.');
    await expect(repriceFoodCheckoutLines(checkout)).rejects.toThrow('Fufu is no longer on the menu.');
    inactiveProductIds.delete('fufu');
    await expect(priceFoodSaleLines('food', [line])).resolves.toMatchObject([line]);
    await expect(repriceFoodCheckoutLines(checkout)).resolves.toMatchObject([line]);
  });

});
