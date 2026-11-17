import { render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SalesPage from '@/app/(protected)/sales/page';
import InventoryPage from '@/app/(protected)/inventory/page';

vi.mock('@/lib/auth', () => {
  const business = { id: 'biz', currency: 'GHS', timezone: 'Africa/Accra' };
  return {
    requireBusiness: async () => ({ business, user: { role: 'OWNER' } }),
    requireBusinessAndOptionalStore: async () => ({ business, store: { id: 'store' }, user: { role: 'OWNER' } }),
  };
});
vi.mock('@/lib/services/stores', () => ({ getBusinessStores: async () => ({ stores: [{ id: 'store', name: 'Main' }] }) }));
vi.mock('@/components/RefreshIndicator', () => ({ default: () => null }));
vi.mock('@/components/SearchFilter', () => ({ default: () => <input type="search" aria-label="Search products" /> }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    salesInvoice: { count: async () => 0, findMany: async () => [] },
    product: {
      count: async () => 3,
      findMany: async () => [3, 1, 0].map(qty => ({
        id: 'product-' + qty, name: 'Milk ' + qty, productUnits: [], reorderPointBase: 2,
        defaultCostBasePence: 600, inventoryBalances: [{ qtyOnHandBase: qty, avgCostBasePence: 500 }],
      })),
    },
  },
}));

afterEach(() => vi.useRealTimers());

it('starts phone filters closed and sets business-local date ranges', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
  const { container } = render(await SalesPage({}));
  const filters = container.querySelector('details')!;
  expect(filters).not.toHaveAttribute('open');
  expect(within(filters).queryByLabelText('Branch')).toBeNull();
  const nav = within(screen.getByRole('navigation', { name: 'Sales date range' }));
  const ranges = {
    Today: ['2026-11-18', '2026-11-18'], Yesterday: ['2026-11-17', '2026-11-17'],
    'This week': ['2026-11-16', '2026-11-18'], 'This month': ['2026-11-01', '2026-11-18'], All: ['', ''],
  };
  for (const [label, [from, to]] of Object.entries(ranges)) {
    expect(nav.getByRole('link', { name: label })).toHaveAttribute('href', `/sales?from=${from}&to=${to}`);
  }
  expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'true');
});

it('puts search before the compact stock tiles and leaves card details closed', async () => {
  const { container } = render(await InventoryPage({}));
  const search = screen.getByRole('searchbox');
  const tiles = screen.getByLabelText('Stock summary');
  expect(search.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(tiles).getByText('Needs a look')).toHaveClass('lg:hidden');
  expect(within(tiles).getAllByText('On this page')).toHaveLength(3);
  expect(within(tiles).getByText('In catalogue')).toBeVisible();
  const cards = [...container.querySelectorAll('details')].filter(detail => detail.querySelector('summary')?.textContent === 'Details');
  expect(cards).toHaveLength(3);
  expect(cards.every(card => !card.open)).toBe(true);
  expect(cards.map(card => card.parentElement?.textContent?.match(/Milk \d/)?.[0])).toEqual(['Milk 0', 'Milk 1', 'Milk 3']);
});
