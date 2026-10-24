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
it('paginates oldest outstanding work with branch isolation', async () => {
  const html = renderToStaticMarkup(await OnlineOrdersPage({}));
  expect(mocks.findMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: expect.objectContaining({ businessId: 'test-business', storeId: 'test-branch', OR: expect.any(Array) }), orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 20, skip: 0 }));
  expect(html).toContain('Refunds needed');
  expect(html).toContain('Page 1 of 1');
});
it('loads page two of full history and keeps search in page and status links', async () => {
  mocks.count.mockResolvedValueOnce(100).mockResolvedValueOnce(3);
  const html = renderToStaticMarkup(await OnlineOrdersPage({ searchParams: Promise.resolve({ status: 'ALL_ORDERS', page: '2', q: 'Ama' }) }));
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], where: expect.objectContaining({ AND: [{ OR: expect.arrayContaining([{ customerName: { contains: 'Ama', mode: 'insensitive' } }]) }] }) }));
  expect(html).toContain('Page 2 of 5');
  expect(html).toContain('status=ALL_ORDERS&amp;q=Ama&amp;page=3');
  expect(html).toContain('status=REFUNDS&amp;q=Ama');
});
it('clamps stale and malformed page numbers', async () => {
  mocks.count.mockResolvedValueOnce(41).mockResolvedValueOnce(0);
  await OnlineOrdersPage({ searchParams: Promise.resolve({ status: 'ALL_ORDERS', page: '9999999' }) });
  expect(mocks.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 40 }));
  await OnlineOrdersPage({ searchParams: Promise.resolve({ page: '-5' }) });
  expect(mocks.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }));
});
it('normalizes a Ghana local phone query while preserving business and branch restrictions', async () => {
  await OnlineOrdersPage({ searchParams: Promise.resolve({ status: 'REFUNDS', q: '024 000 0134' }) });
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: 'test-business', storeId: 'test-branch', status: 'CANCELLED', refundStatus: 'MANUAL_REFUND_NEEDED', AND: [{ OR: expect.arrayContaining([{ customerPhone: { contains: '233240000134' } }]) }] }) }));
});
it('refund filter excludes settled cancellations and preserves selected-order scope', async () => {
  await OnlineOrdersPage({ searchParams: Promise.resolve({ status: 'REFUNDS', order: 'test-order' }) });
  expect(mocks.findMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: { businessId: 'test-business', storeId: 'test-branch', status: 'CANCELLED', refundStatus: 'MANUAL_REFUND_NEEDED', id: 'test-order' } }));
});
it('gives cashiers guidance for fulfilment and escalation', async () => {
  mocks.auth.mockResolvedValue({ user: { role: 'CASHIER' }, business: { id: 'test-business' }, store: { id: 'test-branch' } });
  const html = renderToStaticMarkup(await OnlineOrdersPage({}));
  expect(html).toContain('Payment and refund issues go to a manager.');
});
