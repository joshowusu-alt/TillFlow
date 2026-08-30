import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getUserMock,
  checkBatchSyncRateLimitMock,
  processOfflineSaleMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  checkBatchSyncRateLimitMock: vi.fn(),
  processOfflineSaleMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUser: getUserMock,
}));

vi.mock('@/lib/security/sync-throttle', () => ({
  checkBatchSyncRateLimit: checkBatchSyncRateLimitMock,
}));

vi.mock('../process-offline-sale', () => ({
  processOfflineSale: processOfflineSaleMock,
}));

import { POST } from './route';

function makeSale(id: string) {
  return {
    id,
    storeId: 'store-1',
    tillId: 'till-1',
    customerId: null,
    paymentStatus: 'PAID' as const,
    lines: [
      {
        productId: 'prod-1',
        unitId: 'unit-1',
        qtyInUnit: 1,
        discountType: 'NONE',
        discountValue: '0',
      },
    ],
    payments: [{ method: 'CASH' as const, amountPence: 1000 }],
    orderDiscountType: 'NONE',
    orderDiscountValue: '0',
    createdAt: new Date('2026-03-25T12:00:00Z').toISOString(),
  };
}

function makeRequest(body: unknown) {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest;
}

describe('POST /api/offline/batch-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getUserMock.mockResolvedValue({ id: 'user-1', businessId: 'biz-1' });
    checkBatchSyncRateLimitMock.mockResolvedValue({ blocked: false, retryAfterSeconds: null });
  });

  it('processes queued sales sequentially in request order', async () => {
    const order: string[] = [];

    processOfflineSaleMock.mockImplementation(async (sale: { id: string }) => {
      order.push(`start:${sale.id}`);
      await Promise.resolve();
      order.push(`end:${sale.id}`);
      return { success: true, status: 'synced' as const, invoiceId: `inv-${sale.id}` };
    });

    const response = await POST(
      makeRequest({
        sales: [makeSale('offline-1'), makeSale('offline-2'), makeSale('offline-3')],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        { id: 'offline-1', status: 'synced', invoiceId: 'inv-offline-1', reason: undefined },
        { id: 'offline-2', status: 'synced', invoiceId: 'inv-offline-2', reason: undefined },
        { id: 'offline-3', status: 'synced', invoiceId: 'inv-offline-3', reason: undefined },
      ],
      synced: ['offline-1', 'offline-2', 'offline-3'],
      failed: [],
    });

    expect(order).toEqual([
      'start:offline-1',
      'end:offline-1',
      'start:offline-2',
      'end:offline-2',
      'start:offline-3',
      'end:offline-3',
    ]);
  });

  it('keeps processing later sales after an earlier failure', async () => {
    processOfflineSaleMock
      .mockResolvedValueOnce({ success: true, status: 'synced', invoiceId: 'inv-1' })
      .mockResolvedValueOnce({ success: false, status: 'needs_review', reason: 'insufficient_stock' })
      .mockResolvedValueOnce({ success: true, status: 'synced', invoiceId: 'inv-3' });

    const response = await POST(
      makeRequest({
        sales: [makeSale('offline-1'), makeSale('offline-2'), makeSale('offline-3')],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        { id: 'offline-1', status: 'synced', invoiceId: 'inv-1', reason: undefined },
        { id: 'offline-2', status: 'needs_review', invoiceId: undefined, reason: 'insufficient_stock' },
        { id: 'offline-3', status: 'synced', invoiceId: 'inv-3', reason: undefined },
      ],
      synced: ['offline-1', 'offline-3'],
      failed: [{ id: 'offline-2', error: 'insufficient_stock', status: 'needs_review' }],
    });
  });

  it('one invalid sale does not abort the rest of the batch', async () => {
    processOfflineSaleMock
      .mockResolvedValueOnce({ success: false, status: 'rejected', reason: 'tenant_mismatch' })
      .mockResolvedValueOnce({ success: true, status: 'synced', invoiceId: 'inv-2' });

    const response = await POST(
      makeRequest({
        sales: [makeSale('offline-bad'), makeSale('offline-ok')],
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.synced).toEqual(['offline-ok']);
    expect(body.failed).toEqual([
      { id: 'offline-bad', error: 'tenant_mismatch', status: 'rejected' },
    ]);
    expect(body.results).toHaveLength(2);
  });

  it('returns 401 when unauthenticated', async () => {
    getUserMock.mockResolvedValue(null);

    const response = await POST(makeRequest({ sales: [makeSale('offline-1')] }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 429 when rate limited', async () => {
    checkBatchSyncRateLimitMock.mockResolvedValue({ blocked: true, retryAfterSeconds: 30 });

    const response = await POST(makeRequest({ sales: [makeSale('offline-1')] }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    await expect(response.json()).resolves.toEqual({
      error: 'Too many batch sync requests. Please wait before retrying.',
    });
  });

  it('returns 400 for an empty batch', async () => {
    const response = await POST(makeRequest({ sales: [] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'No sales provided' });
  });
});