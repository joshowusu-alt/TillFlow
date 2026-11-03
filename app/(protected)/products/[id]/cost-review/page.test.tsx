import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireBusiness: mocks.auth }));
vi.mock('@/lib/services/product-cost-review', () => ({ getProductCostReview: mocks.load, COST_REVIEW_PAGE_SIZE: 25 }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
import ProductCostReviewPage from './page';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ business: { id: 'authenticated-business', currency: 'GHS', timezone: 'Africa/Accra' } });
  mocks.load.mockResolvedValue(null);
});
it('requires owner or manager and resolves the exact product within that business', async () => {
  await expect(ProductCostReviewPage({ params: Promise.resolve({ id: 'selected-product' }), searchParams: Promise.resolve({ page: '2' }) })).rejects.toThrow('NOT_FOUND');
  expect(mocks.auth).toHaveBeenCalledWith(['OWNER', 'MANAGER']);
  expect(mocks.load).toHaveBeenCalledWith('authenticated-business', 'selected-product', 2);
});
