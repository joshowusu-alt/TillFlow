import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ context: vi.fn(), features: vi.fn(), count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireBusinessAndOptionalStore: mocks.context }));
vi.mock('@/lib/features', () => ({ getFeatures: mocks.features }));
vi.mock('@/lib/prisma', () => ({ prisma: { onlineOrder: { count: mocks.count, findMany: mocks.findMany, findFirst: mocks.findFirst } } }));
import { GET } from './route';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ user: { role: 'CASHIER' }, business: { id: 'biz1', mode: 'PRO' }, store: { id: 'branch1' } });
  mocks.features.mockReturnValue({ onlineStorefront: true });
  mocks.count.mockResolvedValue(1); mocks.findMany.mockResolvedValue([]); mocks.findFirst.mockResolvedValue({ id: 'order1' });
});
it('limits cashier attention to the authenticated business and selected branch', async () => {
  const response = await GET();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(mocks.count).toHaveBeenCalledWith({ where: expect.objectContaining({ businessId: 'biz1', storeId: 'branch1', OR: expect.arrayContaining([
    { refundStatus: 'MANUAL_REFUND_NEEDED' },
    { status: { in: expect.arrayContaining(['READY_FOR_PICKUP']) } },
  ]) }) });
  expect(mocks.context).toHaveBeenCalledWith(['CASHIER', 'MANAGER', 'OWNER']);
});
it('never returns all-branch customer orders for an unscoped cashier', async () => {
  mocks.context.mockResolvedValue({ user: { role: 'CASHIER' }, business: { id: 'biz1' }, store: null });
  expect(await (await GET()).json()).toEqual({ count: 0, orders: [] });
  expect(mocks.findMany).not.toHaveBeenCalled();
});
it('does not query orders for a business without the storefront entitlement', async () => {
  mocks.features.mockReturnValue({ onlineStorefront: false });
  expect(await (await GET()).json()).toEqual({ count: 0, orders: [] });
  expect(mocks.findMany).not.toHaveBeenCalled();
});
