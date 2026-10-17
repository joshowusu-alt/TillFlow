import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), groupBy: vi.fn(), count: vi.fn(), auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { onlineOrder: mocks } }));
vi.mock('@/lib/auth', () => ({ requireBusinessAndOptionalStore: mocks.auth }));
vi.mock('@/lib/features', () => ({ getFeatures: () => ({ onlineStorefront: true }) }));
vi.mock('@/app/actions/online-storefront', () => ({ retryOnlineOrderSaleAction: vi.fn(), recheckOnlineOrderPaymentAction: vi.fn(), updateOnlineOrderStatusAction: vi.fn(), batchMarkPreparingAction: vi.fn(), markOrderRefundedAction: vi.fn() }));
import OnlineOrdersPage from './page';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { role: 'OWNER' }, business: { id: 'test-business' }, store: { id: 'test-branch' } });
  mocks.findMany.mockResolvedValue([]);
  mocks.groupBy.mockResolvedValue([]);
  mocks.count.mockResolvedValue(3);
});
it('loads oldest outstanding work independently of recent history with branch isolation', async () => {
  const html = renderToStaticMarkup(await OnlineOrdersPage({}));
  const queries = mocks.findMany.mock.calls.map(([query]) => query);
  expect(queries).toHaveLength(2);
  expect(queries[0]).toMatchObject({ where: { businessId: 'test-business', storeId: 'test-branch', OR: expect.any(Array) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100 });
  expect(queries[1]).toMatchObject({ where: { OR: [{ status: 'COMPLETED' }, { status: 'CANCELLED', OR: [{ refundStatus: null }, { refundStatus: { not: 'MANUAL_REFUND_NEEDED' } }] }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10 });
  expect(html).toContain('Refunds needed');
  expect(html).toContain('outstanding');
});
it('refund filter excludes settled cancellations and preserves selected-order scope', async () => {
  await OnlineOrdersPage({ searchParams: { status: 'REFUNDS', order: 'test-order' } });
  expect(mocks.findMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: { businessId: 'test-business', storeId: 'test-branch', status: 'CANCELLED', refundStatus: 'MANUAL_REFUND_NEEDED', id: 'test-order' } }));
});
it('gives cashiers guidance for fulfilment and escalation', async () => {
  mocks.auth.mockResolvedValue({ user: { role: 'CASHIER' }, business: { id: 'test-business' }, store: { id: 'test-branch' } });
  const html = renderToStaticMarkup(await OnlineOrdersPage({}));
  expect(html).toContain('Payment and refund issues go to a manager.');
});
