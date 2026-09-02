import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  withBusinessContextMock,
  recordSupplierPaymentMock,
  redirectMock,
  revalidateTagMock,
  revalidateOwnerDashboardCacheMock,
} = vi.hoisted(() => ({
  withBusinessContextMock: vi.fn(),
  recordSupplierPaymentMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as any).digest = `NEXT_REDIRECT;replace;${url};303`;
    throw err;
  }),
  revalidateTagMock: vi.fn(),
  revalidateOwnerDashboardCacheMock: vi.fn(),
}));

vi.mock('@/lib/action-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/action-utils')>('@/lib/action-utils');
  return {
    ...actual,
    withBusinessContext: withBusinessContextMock,
  };
});

vi.mock('@/lib/services/payments', () => ({
  recordCustomerPayment: vi.fn(),
  recordSupplierPayment: recordSupplierPaymentMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('next/cache', () => ({
  revalidateTag: revalidateTagMock,
}));

vi.mock('@/lib/reports/cache-revalidation', () => ({
  revalidateOwnerDashboardCache: revalidateOwnerDashboardCacheMock,
}));

import { recordSupplierPaymentAction } from './payments';

function form(data: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

describe('recordSupplierPaymentAction authorisation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordSupplierPaymentMock.mockResolvedValue({
      invoice: { id: 'inv-1', payments: [] },
      replayed: false,
    });
  });

  it('allows Owner and passes session-derived role + idempotency key', async () => {
    withBusinessContextMock.mockResolvedValue({
      businessId: 'biz-1',
      user: { id: 'u-owner', role: 'OWNER', name: 'Owner', email: 'o@x.com', businessId: 'biz-1' },
    });

    await expect(
      recordSupplierPaymentAction(
        form({
          invoiceId: 'inv-1',
          paymentMethod: 'TRANSFER',
          amount: '10.00',
          idempotencyKey: 'key-owner-1',
        }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(withBusinessContextMock).toHaveBeenCalledWith(['MANAGER', 'OWNER']);
    expect(recordSupplierPaymentMock).toHaveBeenCalledWith(
      'biz-1',
      'inv-1',
      [{ method: 'TRANSFER', amountPence: 1000 }],
      expect.objectContaining({
        recordedByUserId: 'u-owner',
        actorRole: 'OWNER',
        idempotencyKey: 'key-owner-1',
      }),
    );
  });

  it('allows Manager', async () => {
    withBusinessContextMock.mockResolvedValue({
      businessId: 'biz-1',
      user: { id: 'u-mgr', role: 'MANAGER', name: 'Mgr', email: 'm@x.com', businessId: 'biz-1' },
    });

    await expect(
      recordSupplierPaymentAction(
        form({
          invoiceId: 'inv-1',
          paymentMethod: 'CASH',
          amount: '5.00',
          tillId: 'till-1',
          idempotencyKey: 'key-mgr-1',
        }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(recordSupplierPaymentMock).toHaveBeenCalled();
  });

  it('does not call the service when withBusinessContext denies Cashier', async () => {
    withBusinessContextMock.mockImplementation(async () => {
      redirectMock('/pos');
    });

    await expect(
      recordSupplierPaymentAction(
        form({
          invoiceId: 'inv-1',
          paymentMethod: 'CASH',
          amount: '5.00',
          idempotencyKey: 'key-cashier',
        }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(withBusinessContextMock).toHaveBeenCalledWith(['MANAGER', 'OWNER']);
    expect(recordSupplierPaymentMock).not.toHaveBeenCalled();
  });

  it('does not call the service when unauthenticated context fails', async () => {
    withBusinessContextMock.mockImplementation(async () => {
      redirectMock('/login');
    });

    await expect(
      recordSupplierPaymentAction(
        form({
          invoiceId: 'inv-1',
          amount: '5.00',
          idempotencyKey: 'key-anon',
        }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(recordSupplierPaymentMock).not.toHaveBeenCalled();
  });
});
