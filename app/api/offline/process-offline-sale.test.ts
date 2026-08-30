import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashOfflineSalePayload } from '@/lib/offline/payload-hash';

const { prismaMock, mockCreateSale } = vi.hoisted(() => {
  const mockCreateSale = vi.fn();
  const prismaMock = {
    store: { findFirst: vi.fn() },
    till: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    salesInvoice: { findFirst: vi.fn() },
    shift: { findFirst: vi.fn(), findMany: vi.fn() },
    user: { findFirst: vi.fn() },
  };
  return { prismaMock, mockCreateSale };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/services/sales', () => ({ createSale: mockCreateSale }));
vi.mock('@/lib/billing-db-compat', () => ({
  findBusinessCommercialSnapshot: vi.fn(async () => ({
    business: { id: 'biz-1', plan: 'PRO', storeMode: 'SINGLE_STORE' },
    billingSchemaReady: true,
  })),
}));
vi.mock('@/lib/billing-entitlements', () => ({
  getBillingEntitlement: vi.fn(() => ({ canWrite: true })),
}));

import { processOfflineSale, type OfflineSalePayload } from './process-offline-sale';

const USER = { id: 'user-sync', businessId: 'biz-1' };
const STORE = { id: 'store-1' };
const TILL = { id: 'till-1' };
const OPEN_SHIFT = { id: 'shift-1', tillId: 'till-1', status: 'OPEN', closedAt: null, openKey: 'till-1' };
const CLOSED_SHIFT = { id: 'shift-1', tillId: 'till-1', status: 'CLOSED', closedAt: new Date('2026-08-01T12:00:00Z'), openKey: null };
const CASHIER = { id: 'cashier-1', businessId: 'biz-1', active: true };

function baseFields() {
  return {
    id: 'offline-abc123',
    businessId: 'biz-1',
    storeId: 'store-1',
    tillId: 'till-1',
    shiftId: 'shift-1',
    cashierUserId: 'cashier-1',
    customerId: null as string | null,
    paymentStatus: 'PAID' as const,
    lines: [
      {
        productId: 'prod-1',
        unitId: 'unit-1',
        qtyInUnit: 2,
        unitPricePence: 2500,
        lineSubtotalPence: 5000,
        discountType: 'NONE',
        discountValue: '0',
      },
    ],
    payments: [{ method: 'CASH' as const, amountPence: 5000 }],
    orderDiscountType: 'NONE',
    orderDiscountValue: '0',
    createdAt: new Date().toISOString(),
    localSaleTime: new Date().toISOString(),
    localSequence: 1,
    inventoryPolicy: 'enforce' as const,
  };
}

async function makePayload(overrides: Partial<OfflineSalePayload> = {}): Promise<OfflineSalePayload> {
  const merged = { ...baseFields(), ...overrides } as OfflineSalePayload;
  if (overrides.lines) merged.lines = overrides.lines;
  if (overrides.payments) merged.payments = overrides.payments;
  merged.payloadHash = overrides.payloadHash ?? (await hashOfflineSalePayload({
    ...merged,
    businessId: merged.businessId || USER.businessId,
  }));
  merged.idempotencyKey = overrides.idempotencyKey ?? 'idem-abc123';
  return merged;
}

function setupHappyPath() {
  prismaMock.store.findFirst.mockResolvedValue(STORE);
  prismaMock.till.findFirst.mockResolvedValue(TILL);
  prismaMock.shift.findFirst.mockResolvedValue(OPEN_SHIFT);
  prismaMock.user.findFirst.mockResolvedValue(CASHIER);
  prismaMock.salesInvoice.findFirst.mockResolvedValue(null);
}

describe('processOfflineSale — offline lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPath();
    vi.useRealTimers();
  });

  it('capture → sync while shift open calls createSale with captured cashier and enforce stock', async () => {
    mockCreateSale.mockResolvedValue({ id: 'inv-new' });
    const payload = await makePayload();

    const result = await processOfflineSale(payload, USER);

    expect(result).toEqual({ success: true, status: 'synced', invoiceId: 'inv-new' });
    expect(mockCreateSale).toHaveBeenCalledTimes(1);
    expect(mockCreateSale).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        tillId: 'till-1',
        cashierUserId: 'cashier-1',
        inventoryPolicy: 'enforce',
        externalRef: 'OFFLINE_SYNC:idem-abc123',
      }),
    );
    expect(mockCreateSale.mock.calls[0][0].bypassOpenTillRequirement).toBeUndefined();
  });

  it('capture → shift closed → sync attaches LATE_OFFLINE to original shift', async () => {
    prismaMock.shift.findFirst.mockResolvedValue(CLOSED_SHIFT);
    mockCreateSale.mockResolvedValueOnce({ id: 'inv-late' });
    const payload = await makePayload();

    const result = await processOfflineSale(payload, USER);

    expect(result).toEqual({ success: true, status: 'synced', invoiceId: 'inv-late' });
    expect(mockCreateSale).toHaveBeenCalledWith(
      expect.objectContaining({
        saleSource: 'LATE_OFFLINE',
        capturedShiftId: 'shift-1',
        tillId: 'till-1',
      }),
    );
    expect(mockCreateSale.mock.calls[0][0].bypassOpenTillRequirement).toBeUndefined();
  });

  it('same payload replay returns already_synced without createSale', async () => {
    const payload = await makePayload();
    prismaMock.salesInvoice.findFirst.mockResolvedValue({
      id: 'inv-existing',
      storeId: 'store-1',
      tillId: 'till-1',
      shiftId: 'shift-1',
      cashierUserId: 'cashier-1',
      customerId: null,
      lines: [
        {
          productId: 'prod-1',
          unitId: 'unit-1',
          qtyInUnit: 2,
          unitPricePence: 2500,
          lineSubtotalPence: 5000,
        },
      ],
      payments: [{ method: 'CASH', amountPence: 5000 }],
    });

    const result = await processOfflineSale(payload, USER);

    expect(result).toMatchObject({
      success: true,
      status: 'already_synced',
      invoiceId: 'inv-existing',
    });
    expect(mockCreateSale).not.toHaveBeenCalled();
  });

  it('replay without captured unit prices still returns already_synced', async () => {
    const payload = await makePayload({
      lines: [
        {
          productId: 'prod-1',
          unitId: 'unit-1',
          qtyInUnit: 2,
          discountType: 'NONE',
          discountValue: '0',
        },
      ],
    });
    prismaMock.salesInvoice.findFirst.mockResolvedValue({
      id: 'inv-priced',
      storeId: 'store-1',
      tillId: 'till-1',
      shiftId: 'shift-1',
      cashierUserId: 'cashier-1',
      customerId: null,
      lines: [
        {
          productId: 'prod-1',
          unitId: 'unit-1',
          qtyInUnit: 2,
          unitPricePence: 2500,
          lineSubtotalPence: 5000,
        },
      ],
      payments: [{ method: 'CASH', amountPence: 5000 }],
    });

    const result = await processOfflineSale(payload, USER);

    expect(result).toMatchObject({
      success: true,
      status: 'already_synced',
      invoiceId: 'inv-priced',
    });
    expect(mockCreateSale).not.toHaveBeenCalled();
  });

  it('replay of a cash tender that included change still returns already_synced', async () => {
    const payload = await makePayload({
      payments: [{ method: 'CASH', amountPence: 10000 }],
    });
    prismaMock.salesInvoice.findFirst.mockResolvedValue({
      id: 'inv-change',
      storeId: 'store-1',
      tillId: 'till-1',
      shiftId: 'shift-1',
      cashierUserId: 'cashier-1',
      customerId: null,
      lines: [
        {
          productId: 'prod-1',
          unitId: 'unit-1',
          qtyInUnit: 2,
          unitPricePence: 2500,
          lineSubtotalPence: 5000,
        },
      ],
      payments: [{ method: 'CASH', amountPence: 5000 }],
    });

    const result = await processOfflineSale(payload, USER);

    expect(result).toMatchObject({
      success: true,
      status: 'already_synced',
      invoiceId: 'inv-change',
    });
    expect(mockCreateSale).not.toHaveBeenCalled();
  });

  it('same key different payload is rejected', async () => {
    const payload = await makePayload({
      lines: [
        {
          productId: 'prod-1',
          unitId: 'unit-1',
          qtyInUnit: 9,
          unitPricePence: 2500,
          lineSubtotalPence: 22500,
          discountType: 'NONE',
          discountValue: '0',
        },
      ],
    });
    prismaMock.salesInvoice.findFirst.mockResolvedValue({
      id: 'inv-existing',
      storeId: 'store-1',
      tillId: 'till-1',
      shiftId: 'shift-1',
      cashierUserId: 'cashier-1',
      customerId: null,
      lines: [
        {
          productId: 'prod-1',
          unitId: 'unit-1',
          qtyInUnit: 2,
          unitPricePence: 2500,
          lineSubtotalPence: 5000,
        },
      ],
      payments: [{ method: 'CASH', amountPence: 5000 }],
    });

    const result = await processOfflineSale(payload, USER);

    expect(result).toEqual({ success: false, status: 'rejected', reason: 'payload_mismatch' });
    expect(mockCreateSale).not.toHaveBeenCalled();
  });

  it('tenant attack is rejected', async () => {
    const payload = await makePayload({ businessId: 'biz-attacker' });

    const result = await processOfflineSale(payload, USER);

    expect(result).toEqual({ success: false, status: 'rejected', reason: 'tenant_mismatch' });
    expect(mockCreateSale).not.toHaveBeenCalled();
    expect(prismaMock.store.findFirst).not.toHaveBeenCalled();
  });

  it('network timeout after commit — idempotent replay returns already_synced', async () => {
    const payload = await makePayload();
    const existing = {
      id: 'inv-committed',
      storeId: 'store-1',
      tillId: 'till-1',
      shiftId: 'shift-1',
      cashierUserId: 'cashier-1',
      customerId: null,
      lines: [
        {
          productId: 'prod-1',
          unitId: 'unit-1',
          qtyInUnit: 2,
          unitPricePence: 2500,
          lineSubtotalPence: 5000,
        },
      ],
      payments: [{ method: 'CASH', amountPence: 5000 }],
    };

    // First attempt: committed, client timed out before seeing 200
    mockCreateSale.mockResolvedValue({ id: 'inv-committed' });
    const first = await processOfflineSale(payload, USER);
    expect(first).toEqual({ success: true, status: 'synced', invoiceId: 'inv-committed' });

    // Replay after timeout: invoice now exists for the same key + hash
    prismaMock.salesInvoice.findFirst.mockResolvedValue(existing);
    const replay = await processOfflineSale(payload, USER);

    expect(replay).toMatchObject({
      success: true,
      status: 'already_synced',
      invoiceId: 'inv-committed',
    });
    expect(mockCreateSale).toHaveBeenCalledTimes(1);
  });

  it('P2002 race after commit is treated as already_synced when fingerprint matches', async () => {
    const payload = await makePayload();
    prismaMock.salesInvoice.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'inv-race',
        storeId: 'store-1',
        tillId: 'till-1',
        cashierUserId: 'cashier-1',
        customerId: null,
        lines: [
          {
            productId: 'prod-1',
            unitId: 'unit-1',
            qtyInUnit: 2,
            unitPricePence: 2500,
            lineSubtotalPence: 5000,
          },
        ],
        payments: [{ method: 'CASH', amountPence: 5000 }],
      });

    mockCreateSale.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['externalRef'] },
      }),
    );

    const result = await processOfflineSale(payload, USER);

    expect(result).toMatchObject({ success: true, status: 'already_synced', invoiceId: 'inv-race' });
  });

  it('insufficient stock is needs_review and does not allow-negative by default', async () => {
    mockCreateSale.mockRejectedValue(new Error('Insufficient on hand'));
    const payload = await makePayload();

    const result = await processOfflineSale(payload, USER);

    expect(result).toEqual({ success: false, status: 'needs_review', reason: 'insufficient_stock' });
    expect(mockCreateSale).toHaveBeenCalledWith(expect.objectContaining({ inventoryPolicy: 'enforce' }));
  });

  it('deleted product is needs_review', async () => {
    mockCreateSale.mockRejectedValue(new Error('Unit not configured for product'));
    const payload = await makePayload();

    const result = await processOfflineSale(payload, USER);

    expect(result).toEqual({ success: false, status: 'needs_review', reason: 'product_deleted' });
  });

  it('clock skew over 24h is needs_review', async () => {
    const payload = await makePayload({
      localSaleTime: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });

    const result = await processOfflineSale(payload, USER);

    expect(result).toEqual({ success: false, status: 'needs_review', reason: 'clock_skew' });
    expect(mockCreateSale).not.toHaveBeenCalled();
  });

  it('missing shiftId is needs_review (legacy queue migrate path)', async () => {
    const payload = await makePayload({ shiftId: null });

    const result = await processOfflineSale(payload, USER);

    expect(result).toEqual({ success: false, status: 'needs_review', reason: 'missing_shift' });
    expect(mockCreateSale).not.toHaveBeenCalled();
  });

  it('revoked cashier does not rewrite captured cashierUserId', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'cashier-1', businessId: 'biz-1', active: false });
    mockCreateSale.mockResolvedValue({ id: 'inv-revoked-cashier' });
    const payload = await makePayload();

    const result = await processOfflineSale(payload, USER);

    expect(result).toEqual({ success: true, status: 'synced', invoiceId: 'inv-revoked-cashier' });
    expect(mockCreateSale).toHaveBeenCalledWith(
      expect.objectContaining({ cashierUserId: 'cashier-1' }),
    );
    expect(mockCreateSale.mock.calls[0][0].cashierUserId).not.toBe(USER.id);
  });

  it('cashier from another tenant is needs_review', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'cashier-1', businessId: 'biz-other', active: true });
    const payload = await makePayload();

    const result = await processOfflineSale(payload, USER);

    expect(result).toEqual({ success: false, status: 'needs_review', reason: 'cashier_revoked' });
    expect(mockCreateSale).not.toHaveBeenCalled();
  });

  it('tampered payloadHash is rejected', async () => {
    const payload = await makePayload({ payloadHash: 'deadbeef' });

    const result = await processOfflineSale(payload, USER);

    expect(result).toEqual({ success: false, status: 'rejected', reason: 'payload_mismatch' });
    expect(mockCreateSale).not.toHaveBeenCalled();
  });

  it('omitted payloadHash is rejected', async () => {
    const payload = await makePayload({ payloadHash: '' });

    const result = await processOfflineSale(payload, USER);

    expect(result).toEqual({ success: false, status: 'rejected', reason: 'payload_mismatch' });
    expect(mockCreateSale).not.toHaveBeenCalled();
  });

  it('duplicate local sequence in the same batch is needs_review for the second item', async () => {
    mockCreateSale.mockResolvedValue({ id: 'inv-seq' });
    const first = await makePayload({ id: 'offline-1', idempotencyKey: 'idem-1', localSequence: 4 });
    const second = await makePayload({ id: 'offline-2', idempotencyKey: 'idem-2', localSequence: 4 });
    const seenSequences = new Set<string>();

    const a = await processOfflineSale(first, USER, { seenSequences });
    const b = await processOfflineSale(second, USER, { seenSequences });

    expect(a.status).toBe('synced');
    expect(b).toEqual({ success: false, status: 'needs_review', reason: 'duplicate_local_sequence' });
  });

  it('unexpected createSale failure still throws', async () => {
    mockCreateSale.mockRejectedValue(new Error('Unexpected DB error'));
    const payload = await makePayload();

    await expect(processOfflineSale(payload, USER)).rejects.toThrow('Unexpected DB error');
  });

  it('createSale is called with user.businessId not a spoofed payload tenant', async () => {
    mockCreateSale.mockResolvedValue({ id: 'inv-biz' });
    const customUser = { id: 'user-99', businessId: 'biz-correct' };
    prismaMock.store.findFirst.mockResolvedValue(STORE);
    prismaMock.user.findFirst.mockResolvedValue({ id: 'cashier-1', businessId: 'biz-correct', active: true });
    const payload = await makePayload({ businessId: 'biz-correct' });

    await processOfflineSale(payload, customUser);

    expect(mockCreateSale).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'biz-correct' }));
  });
});
