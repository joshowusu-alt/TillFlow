import { beforeEach, expect, it, vi } from 'vitest';

const { auth, newest, count, orders } = vi.hoisted(() => ({
  auth: vi.fn(), newest: vi.fn(), count: vi.fn(), orders: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireBusinessAndOptionalStore: auth }));
vi.mock('@/lib/prisma', () => ({ prisma: { onlineOrder: { findFirst: newest, count, findMany: orders } } }));
import { GET } from './route';

const business = { id: 'synthetic-business', plan: 'PRO', storefrontEnabled: true, billingCanWrite: true };
beforeEach(() => { vi.clearAllMocks(); newest.mockResolvedValue(null); count.mockResolvedValue(0); orders.mockResolvedValue([]); });

it.each([
  { user: { role: 'OWNER' }, business: { ...business, storefrontEnabled: false }, store: { id: 'branch' } },
  { user: { role: 'OWNER' }, business: { ...business, plan: 'STARTER' }, store: { id: 'branch' } },
  { user: { role: 'CASHIER' }, business, store: null },
  { user: { role: 'OWNER' }, business: { ...business, billingCanWrite: false }, store: { id: 'branch' } },
])('returns ineligible without reading any order data', async (scope) => {
  auth.mockResolvedValue(scope);
  expect(await (await GET()).json()).toEqual({ eligible: false, count: 0, orders: [] });
  expect(newest).not.toHaveBeenCalled();
  expect(count).not.toHaveBeenCalled();
  expect(orders).not.toHaveBeenCalled();
});

it('preserves tenant and branch filters for the eligible cashier', async () => {
  auth.mockResolvedValue({ user: { role: 'CASHIER' }, business, store: { id: 'branch' } });
  const response = await GET();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({ eligible: true, count: 0, orders: [] });
  expect(auth).toHaveBeenCalledWith(['CASHIER', 'MANAGER', 'OWNER']);
  for (const query of [newest, count, orders]) {
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      businessId: business.id, storeId: 'branch', OR: expect.arrayContaining([
        { refundStatus: 'MANUAL_REFUND_NEEDED' },
        { status: { in: expect.arrayContaining(['READY_FOR_PICKUP']) } },
      ]),
    }) }));
  }
});
