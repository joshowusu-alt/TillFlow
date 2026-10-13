import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  business: { findUnique: vi.fn() },
  store: { findMany: vi.fn(), findFirst: vi.fn() },
  salesPayment: { findMany: vi.fn() },
  paymentReconciliation: { findMany: vi.fn(), upsert: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/action-utils', () => ({
  withBusinessContext: vi.fn(async () => ({ businessId: 'biz-a', user: { id: 'owner' } })),
  safeAction: async (fn: () => unknown) => fn(),
  formAction: async (fn: () => unknown) => fn(),
  ok: (data?: unknown) => ({ success: true, data }),
  err: (error: string) => ({ success: false, error }),
}));
import { getPaymentTransactions, getReconciliationSummary, reconcilePaymentAction } from '@/app/actions/reconciliation';

beforeEach(() => {
  vi.clearAllMocks();
  db.business.findUnique.mockResolvedValue({ timezone: 'Africa/Accra' });
  db.store.findMany.mockResolvedValue([{ id: 'branch-a' }]);
  db.store.findFirst.mockResolvedValue({ id: 'branch-a' });
  db.salesPayment.findMany.mockResolvedValue([]);
  db.paymentReconciliation.findMany.mockResolvedValue([]);
});

describe('receipt comparison actions', () => {
  it('summary uses confirmed receipts inside the exact exclusive period', async () => {
    const from = new Date('2026-03-01T00:00:00Z');
    const to = new Date('2026-04-01T00:00:00Z');
    await getReconciliationSummary({ from, to });
    expect(db.salesPayment.findMany.mock.calls[0][0].where).toEqual({
      method: { in: ['CARD', 'TRANSFER'] }, status: 'CONFIRMED', receivedAt: { gte: from, lt: to },
      salesInvoice: { businessId: 'biz-a', storeId: { in: ['branch-a'] } },
    });
  });
  it('drill-down includes later receipts from older invoices without a sale-date filter', async () => {
    await getPaymentTransactions({ date: new Date('2026-03-01T00:00:00Z'), method: 'TRANSFER', storeId: 'branch-a' });
    expect(db.salesPayment.findMany.mock.calls[0][0].where).toEqual({
      method: 'TRANSFER', status: 'CONFIRMED', receivedAt: { gte: new Date('2026-03-01T00:00:00Z'), lt: new Date('2026-03-02T00:00:00Z') },
      salesInvoice: { businessId: 'biz-a', storeId: 'branch-a' },
    });
  });
  it('refuses saving a comparison to another business branch', async () => {
    db.store.findFirst.mockResolvedValue(null);
    const form = new FormData();
    for (const [key, value] of Object.entries({ date: '2026-03-01', paymentMethod: 'CARD', storeId: 'foreign', actualTotal: '10' })) form.set(key, value);
    await reconcilePaymentAction(form);
    expect(db.paymentReconciliation.upsert).not.toHaveBeenCalled();
    expect(db.salesPayment.findMany).not.toHaveBeenCalled();
  });
  it.each(['', 'abc', '-1', 'Infinity', '21474836.48'])('rejects invalid statement total %s', async actualTotal => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ date: '2026-03-01', paymentMethod: 'CARD', storeId: 'branch-a', actualTotal })) form.set(key, value);
    await reconcilePaymentAction(form);
    expect(db.paymentReconciliation.upsert).not.toHaveBeenCalled();
  });
  it('saves a zero statement total against live confirmed receipt money', async () => {
    db.salesPayment.findMany.mockResolvedValue([{ amountPence: 1000 }]);
    const form = new FormData();
    for (const [key, value] of Object.entries({ date: '2026-03-01', paymentMethod: 'CARD', storeId: 'branch-a', actualTotal: '0' })) form.set(key, value);
    await reconcilePaymentAction(form);
    expect(db.paymentReconciliation.upsert.mock.calls[0][0].create).toMatchObject({ systemTotalPence: 1000, actualTotalPence: 0, variancePence: -1000, status: 'DISCREPANCY' });
  });
});
