import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_PAGE_SIZE } from '@/lib/format';

const suppliers = Array.from({ length: 24 }, (_, index) => ({
  id: `supplier-${index + 1}`,
  name: `Bookshop ${index + 1}`,
  phone: null,
  email: null,
  creditLimitPence: 0,
  tagsJson: null,
  purchaseInvoices: [],
}));

const mocks = vi.hoisted(() => ({
  db: {
    supplier: { count: vi.fn(), findMany: vi.fn() },
    product: { groupBy: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.db }));
vi.mock('@/lib/auth', () => ({
  requireBusiness: async () => ({ user: { role: 'OWNER' }, business: { id: 'biz', currency: 'GHS' } }),
}));
vi.mock('@/app/actions/suppliers', () => ({ createSupplierAction: '/unused' }));
vi.mock('@/components/SubmitButton', () => ({ default: ({ children }: { children: ReactNode }) => <button>{children}</button> }));
vi.mock('@/components/SearchFilter', () => ({ default: () => <input aria-label="Search suppliers" /> }));
vi.mock('@/components/suppliers/SupplierListStateSync', () => ({ default: () => null }));
vi.mock('@/lib/services/supplier-kpis', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/supplier-kpis')>('@/lib/services/supplier-kpis');
  return {
    ...actual,
    getSupplierListKpis: async () => ({ suppliersWithBalanceCount: 0, totalApOutstandingPence: 0, scope: 'all' as const }),
  };
});

import SuppliersPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.product.groupBy.mockResolvedValue([]);
  mocks.db.supplier.count.mockImplementation(async () => suppliers.length);
  mocks.db.supplier.findMany.mockImplementation(async ({ skip = 0, take = DEFAULT_PAGE_SIZE }: { skip?: number; take?: number }) => (
    suppliers.slice(skip, skip + take)
  ));
});

describe('supplier list paging', () => {
  it('shows the last valid page instead of an empty catalogue when the URL page is past the end', async () => {
    const html = renderToStaticMarkup(await SuppliersPage({ searchParams: Promise.resolve({ page: '2' }) }));
    expect(html).toContain('Bookshop 1');
    expect(html).toContain('Bookshop 24');
    expect(html).toContain('Showing 1–24 of 24 suppliers.');
    expect(html).not.toContain('No suppliers yet.');
    expect(html).not.toContain('Showing 26–24');
    expect(mocks.db.supplier.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ skip: DEFAULT_PAGE_SIZE, take: DEFAULT_PAGE_SIZE }));
    expect(mocks.db.supplier.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0, take: DEFAULT_PAGE_SIZE }));
  });

  it('shows the first-supplier empty state only when the business has no suppliers', async () => {
    mocks.db.supplier.count.mockResolvedValue(0);
    mocks.db.supplier.findMany.mockResolvedValue([]);
    const html = renderToStaticMarkup(await SuppliersPage({ searchParams: Promise.resolve({ page: '2' }) }));
    expect(html).toContain('No suppliers yet.');
    expect(html).toContain('Add your first supplier so you can track purchases, payables, and payments in one place.');
    expect(html).toContain('Showing 0 of 0 suppliers.');
    expect(mocks.db.supplier.findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps the search empty state when nothing matches, instead of the first-supplier message', async () => {
    mocks.db.supplier.count.mockResolvedValue(0);
    mocks.db.supplier.findMany.mockResolvedValue([]);
    const html = renderToStaticMarkup(await SuppliersPage({ searchParams: Promise.resolve({ q: 'missing' }) }));
    expect(html).toContain('No suppliers matching &quot;missing&quot;.');
    expect(html).not.toContain('No suppliers yet.');
  });
});
