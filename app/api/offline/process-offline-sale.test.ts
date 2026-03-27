import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { prismaMock, mockCreateSale } = vi.hoisted(() => {
  const mockCreateSale = vi.fn();
  const prismaMock = {
    store: { findFirst: vi.fn() },
    till: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    salesInvoice: { findFirst: vi.fn() },
  };
  return { prismaMock, mockCreateSale };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/services/sales', () => ({ createSale: mockCreateSale }));

// Import AFTER mocks
import { processOfflineSale, type OfflineSalePayload } from './process-offline-sale';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------
const USER = { id: 'user-1', businessId: 'biz-1' };
const STORE = { id: 'store-1' };
const TILL = { id: 'till-1' };

function makePayload(overrides: Partial<OfflineSalePayload> = {}): OfflineSalePayload {
  return {
    id: 'offline-abc123',
    storeId: 'store-1',
    tillId: 'till-1',
    customerId: null,
    paymentStatus: 'PAID',
    lines: [
      {
        productId: 'prod-1',
        unitId: 'unit-1',
        qtyInUnit: 2,
        discountType: 'NONE',
        discountValue: '0',
      },
    ],
    payments: [{ method: 'CASH', amountPence: 5000 }],
    orderDiscountType: 'NONE',
    orderDiscountValue: '0',
    createdAt: new Date('2025-01-15T10:00:00Z').toISOString(),
    ...overrides,
  };
}

function setupStoreTill() {
  prismaMock.store.findFirst.mockResolvedValue(STORE);
  prismaMock.till.findFirst.mockResolvedValue(TILL);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('processOfflineSale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStoreTill();
  });

  it('1. idempotency — duplicate externalRef returns existing invoiceId without calling createSale', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue({ id: 'inv-existing' });

    const result = await processOfflineSale(makePayload(), USER);

    expect(result).toMatchObject({ success: true, invoiceId: 'inv-existing' });
    expect(mockCreateSale).not.toHaveBeenCalled();
  });

  it('2. successful new sale — createSale succeeds and returns invoiceId', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue(null);
    mockCreateSale.mockResolvedValue({ id: 'inv-new' });

    const result = await processOfflineSale(makePayload(), USER);

    expect(result).toEqual({ success: true, invoiceId: 'inv-new' });
    expect(mockCreateSale).toHaveBeenCalledTimes(1);
  });

  it('3. P2002 race condition — falls back to findFirst and returns existing invoice', async () => {
    prismaMock.salesInvoice.findFirst
      .mockResolvedValueOnce(null)              // initial idempotency check
      .mockResolvedValueOnce({ id: 'inv-race' }); // fallback after P2002

    const p2002Error = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['externalRef'] },
    });
    mockCreateSale.mockRejectedValue(p2002Error);

    const result = await processOfflineSale(makePayload(), USER);

    expect(result).toMatchObject({ success: true, invoiceId: 'inv-race' });
  });

  it('4. createSale failure — propagates non-P2002 error', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue(null);
    mockCreateSale.mockRejectedValue(new Error('Unexpected DB error'));

    await expect(processOfflineSale(makePayload(), USER)).rejects.toThrow('Unexpected DB error');
  });

  it('5. businessId from user auth — createSale called with user.businessId not payload value', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue(null);
    mockCreateSale.mockResolvedValue({ id: 'inv-biz' });

    const customUser = { id: 'user-99', businessId: 'biz-correct' };
    await processOfflineSale(makePayload(), customUser);

    expect(mockCreateSale).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-correct' })
    );
  });

  it('6. offline sync replays sale with allow-negative inventory policy', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue(null);
    mockCreateSale.mockResolvedValue({ id: 'inv-offline' });

    await processOfflineSale(makePayload(), USER);

    expect(mockCreateSale).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryPolicy: 'allow-negative',
        externalRef: 'OFFLINE_SYNC:offline-abc123',
      })
    );
  });
});
