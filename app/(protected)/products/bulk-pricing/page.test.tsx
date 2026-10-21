import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), categories: vi.fn(), divisions: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireBusiness: m.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: { category: { findMany: m.categories } } }));
vi.mock('@/lib/services/product-classification', () => ({ listProductDivisions: m.divisions }));
vi.mock('@/components/products/BulkPricingClient', () => ({ default: () => null }));
import BulkPricingPage from './page';
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ business: { id: 'business', plan: 'GROWTH', storeMode: 'SINGLE_STORE', currency: 'GHS' } }); m.categories.mockResolvedValue([]); m.divisions.mockResolvedValue([]); });
it('requires owner or manager access and only loads this business classification', async () => {
  await BulkPricingPage({}); expect(m.auth).toHaveBeenCalledWith(['OWNER', 'MANAGER']); expect(m.categories.mock.calls[0][0].where).toEqual({ businessId: 'business' }); expect(m.divisions).toHaveBeenCalledWith('business');
});
it('does not load pricing controls for Starter', async () => {
  m.auth.mockResolvedValue({ business: { id: 'business', plan: 'STARTER' } }); await BulkPricingPage({}); expect(m.categories).not.toHaveBeenCalled(); expect(m.divisions).not.toHaveBeenCalled();
});
