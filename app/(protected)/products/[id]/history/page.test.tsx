import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireBusinessStore: mocks.auth }));
vi.mock('@/lib/services/product-history', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/product-history')>('@/lib/services/product-history');
  return { ...actual, getProductHistory: mocks.load };
});
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
import ProductHistoryPage from './page';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ business: { id: 'business', timezone: 'Africa/Accra', currency: 'GHS' }, store: { id: 'authorised-store' } });
  mocks.load.mockResolvedValue(null);
});
it('requires an owner or manager and uses the authenticated branch for history', async () => {
  await expect(ProductHistoryPage({ params: Promise.resolve({ id: 'book' }), searchParams: Promise.resolve({ page: '2', from: '2026-10-01', to: '2026-10-31' }) })).rejects.toThrow('NOT_FOUND');
  expect(mocks.auth).toHaveBeenCalledWith(['OWNER', 'MANAGER']);
  expect(mocks.load).toHaveBeenCalledWith({ businessId: 'business', storeId: 'authorised-store', productId: 'book', page: 2, receiptsPage: 1, start: new Date('2026-10-01T00:00:00Z'), endExclusive: new Date('2026-11-01T00:00:00Z') });
});
it('rejects reversed or invalid dates instead of silently querying all history', async () => {
  await ProductHistoryPage({ params: Promise.resolve({ id: 'book' }), searchParams: Promise.resolve({ from: '2026-11-01', to: '2026-10-01' }) });
  expect(mocks.load).not.toHaveBeenCalled();
  await ProductHistoryPage({ params: Promise.resolve({ id: 'book' }), searchParams: Promise.resolve({ from: 'bad-date' }) });
  expect(mocks.load).not.toHaveBeenCalled();
});
