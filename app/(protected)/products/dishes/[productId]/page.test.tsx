import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DishPage from './page';

const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  dish: vi.fn(),
  balance: vi.fn(),
  preparation: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireBusinessAndOptionalStore: mock.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: { foodDish: { findFirst: mock.dish }, inventoryBalance: { findUnique: mock.balance }, foodPreparation: { findFirst: mock.preparation } },
}));
vi.mock('@/lib/food/record-history', () => ({ loadFoodRecordHistory: vi.fn() }));
vi.mock('@/lib/food/ingredient-options', () => ({ ingredientOptions: vi.fn() }));
vi.mock('@/components/food/DishForm', () => ({ default: () => <button>Save dish</button> }));
vi.mock('@/components/food/FoodRecordHistory', () => ({ default: () => <p>Cooking history</p> }));
vi.mock('@/components/food/PreparePortionsForm', () => ({ default: () => <button>Add cooked portions</button> }));
vi.mock('@/components/food/LeftoverWriteOffForm', () => ({ default: () => <button>Write off leftovers</button> }));

const fixture = {
  productId: 'bowl',
  product: { name: 'Rice bowl', sellingPriceBasePence: 1800 },
  stockMode: 'COUNTED',
  soldOut: true,
  lowAt: 2,
  sizes: [
    { id: 'large', name: 'Large', pricePence: 2400, active: true },
    { id: 'retired', name: 'Retired size', pricePence: 1000, active: false },
  ],
  groups: [{
    id: 'extras', name: 'Add-ons',
    addons: [
      { id: 'egg', name: 'Fried egg', pricePence: 200, active: true },
      { id: 'old', name: 'Retired extra', active: false },
    ],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.auth.mockResolvedValue({
    business: { id: 'kitchen', currency: 'GHS', businessCategory: 'FOOD_DISHES' },
    user: { role: 'CASHIER' },
    store: { id: 'branch' },
  });
  mock.dish.mockResolvedValue(fixture);
  mock.balance.mockResolvedValue({ qtyOnHandBase: 5 });
});

describe('cashier dish view', () => {
  it('shows sale options and remaining portions without edits or cooking records', async () => {
    render(await DishPage({ params: Promise.resolve({ productId: 'bowl' }) }));
    expect(mock.auth).toHaveBeenCalledWith(['CASHIER', 'MANAGER', 'OWNER']);
    expect(mock.dish).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'kitchen', productId: 'bowl' } }));
    expect(screen.getByRole('heading', { name: 'Rice bowl' })).toBeVisible();
    expect(screen.getByText('Sold out · 5 portions left')).toBeVisible();
    expect(screen.getByText('Large')).toBeVisible();
    expect(screen.getByText(/24\.00/)).toBeVisible();
    expect(screen.getByText('Fried egg')).toBeVisible();
    expect(screen.getByText(/2\.00/)).toBeVisible();
    expect(screen.queryByText(/Retired/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Cooking history')).toBeNull();
    expect(mock.preparation).not.toHaveBeenCalled();
  });

  it('shows an available uncounted dish without inventing a portion count', async () => {
    mock.dish.mockResolvedValue({ ...fixture, stockMode: 'NOT_COUNTED', soldOut: false, sizes: [] });
    render(await DishPage({ params: Promise.resolve({ productId: 'bowl' }) }));
    expect(screen.getByText('Available')).toBeVisible();
    expect(screen.getByText(/18\.00/)).toBeVisible();
    expect(screen.queryByText(/portions left/)).toBeNull();
    expect(mock.balance).not.toHaveBeenCalled();
  });
});
