import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  prismaMock,
  postJournalEntryMock,
  fetchInventoryMapMock,
  decrementInventoryBalanceMock,
  getOpenShiftForTillMock,
  recordCashDrawerEntryTxMock,
  detectExcessiveDiscountRiskMock,
  detectNegativeMarginRiskMock,
  resolveBranchIdForStoreMock,
} = vi.hoisted(() => ({
  prismaMock: {
    business: { findUnique: vi.fn() },
    store: { findFirst: vi.fn() },
    till: { findFirst: vi.fn() },
    productUnit: { findMany: vi.fn() },
    customer: { findFirst: vi.fn() },
    account: { findMany: vi.fn() },
    user: { findFirst: vi.fn() },
    mobileMoneyCollection: { findFirst: vi.fn() },
    salesInvoice: { create: vi.fn() },
    stockMovement: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
  fetchInventoryMapMock: vi.fn(),
  decrementInventoryBalanceMock: vi.fn(),
  getOpenShiftForTillMock: vi.fn(),
  recordCashDrawerEntryTxMock: vi.fn(),
  detectExcessiveDiscountRiskMock: vi.fn(),
  detectNegativeMarginRiskMock: vi.fn(),
  resolveBranchIdForStoreMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/accounting', () => ({
  ACCOUNT_CODES: {
    cash: '1000',
    bank: '1010',
    ar: '1100',
    sales: '4000',
    vatPayable: '2100',
    cogs: '5000',
    inventory: '1200',
  },
  postJournalEntry: postJournalEntryMock,
}));
vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    fetchInventoryMap: fetchInventoryMapMock,
    decrementInventoryBalance: decrementInventoryBalanceMock,
  };
});
vi.mock('./cash-drawer', () => ({
  getOpenShiftForTill: getOpenShiftForTillMock,
  recordCashDrawerEntryTx: recordCashDrawerEntryTxMock,
}));
vi.mock('./risk-monitor', () => ({
  detectExcessiveDiscountRisk: detectExcessiveDiscountRiskMock,
  detectNegativeMarginRisk: detectNegativeMarginRiskMock,
}));
vi.mock('./branches', () => ({
  resolveBranchIdForStore: resolveBranchIdForStoreMock,
}));
vi.mock('@/lib/fraud/reason-codes', () => ({
  isDiscountReasonCode: vi.fn().mockReturnValue(true),
}));

import { createSale, type SaleLineInput } from './sales';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BIZ_ID = 'biz-1';
const STORE_ID = 'store-1';
const TILL_ID = 'till-1';
const PRODUCT_ID = 'prod-1';
const UNIT_ID = 'unit-piece';

function makeBaseInput(overrides: Partial<Parameters<typeof createSale>[0]> = {}) {
  return {
    businessId: BIZ_ID,
    storeId: STORE_ID,
    tillId: TILL_ID,
    cashierUserId: 'user-1',
    paymentStatus: 'PAID' as const,
    payments: [],
    lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 1 }] as SaleLineInput[],
    ...overrides,
  };
}

function makeProductUnit(overrides: Record<string, any> = {}) {
  const { product: productOverrides, unit: unitOverrides, ...rest } = overrides;
  return {
    productId: PRODUCT_ID,
    unitId: UNIT_ID,
    conversionToBase: 1,
    isBaseUnit: true,
    product: {
      id: PRODUCT_ID,
      businessId: 'biz-1',
      sellingPriceBasePence: 500,
      defaultCostBasePence: 300,
      vatRateBps: 1500,
      promoBuyQty: 0,
      promoGetQty: 0,
      ...productOverrides,
    },
    unit: { name: 'Piece', pluralName: 'Pieces', ...unitOverrides },
    ...rest,
  };
}

const defaultAccounts = [
  { code: '1000', id: 'acc-cash' },
  { code: '1010', id: 'acc-bank' },
  { code: '1100', id: 'acc-ar' },
  { code: '4000', id: 'acc-sales' },
  { code: '2100', id: 'acc-vat' },
  { code: '5000', id: 'acc-cogs' },
  { code: '1200', id: 'acc-inv' },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  prismaMock.business.findUnique.mockResolvedValue({
    id: BIZ_ID,
    vatEnabled: false,
    currency: 'GHS',
    requireOpenTillForSales: false,
    discountApprovalThresholdBps: 5000,
  });
  prismaMock.store.findFirst.mockResolvedValue({ id: STORE_ID });
  prismaMock.till.findFirst.mockResolvedValue({ id: TILL_ID });
  prismaMock.account.findMany.mockResolvedValue(defaultAccounts);
  prismaMock.customer.findFirst.mockResolvedValue(null);
  prismaMock.mobileMoneyCollection.findFirst.mockResolvedValue(null);
  prismaMock.productUnit.findMany.mockResolvedValue([makeProductUnit()]);
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  prismaMock.salesInvoice.create.mockResolvedValue({
    id: 'inv-1',
    totalPence: 0,
    lines: [],
    payments: [],
  });
  // Additional tx models used inside the transaction
  (prismaMock as any).cashDrawerEntry = { create: vi.fn().mockResolvedValue({}) };
  (prismaMock as any).shift = { update: vi.fn().mockResolvedValue({}) };
  (prismaMock as any).inventoryBalance = { upsert: vi.fn().mockResolvedValue({}) };

  fetchInventoryMapMock.mockResolvedValue(
    new Map([[PRODUCT_ID, { qtyOnHandBase: 100, avgCostBasePence: 300 }]])
  );
  decrementInventoryBalanceMock.mockResolvedValue(97);
  getOpenShiftForTillMock.mockResolvedValue(null);
  recordCashDrawerEntryTxMock.mockResolvedValue(undefined);
  detectExcessiveDiscountRiskMock.mockResolvedValue(undefined);
  detectNegativeMarginRiskMock.mockResolvedValue(undefined);
  resolveBranchIdForStoreMock.mockResolvedValue('branch-1');
  postJournalEntryMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSale — validation', () => {
  it('throws when cart is empty', async () => {
    await expect(createSale(makeBaseInput({ lines: [] }))).rejects.toThrow('No items in cart');
  });

  it('throws when business not found', async () => {
    prismaMock.business.findUnique.mockResolvedValue(null);
    await expect(createSale(makeBaseInput())).rejects.toThrow('Business not found');
  });

  it('throws when store not found', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null);
    await expect(createSale(makeBaseInput())).rejects.toThrow('Store not found');
  });

  it('throws when till not found', async () => {
    prismaMock.till.findFirst.mockResolvedValue(null);
    await expect(createSale(makeBaseInput())).rejects.toThrow('Till not found');
  });

  it('throws when qty is zero', async () => {
    await expect(
      createSale(makeBaseInput({
        lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 0 }],
      }))
    ).rejects.toThrow('Quantity must be at least 1');
  });

  it('throws when unit not configured for product', async () => {
    prismaMock.productUnit.findMany.mockResolvedValue([]);
    await expect(createSale(makeBaseInput())).rejects.toThrow('Unit not configured for product');
  });

  it('throws on insufficient stock', async () => {
    fetchInventoryMapMock.mockResolvedValue(
      new Map([[PRODUCT_ID, { qtyOnHandBase: 5, avgCostBasePence: 300 }]])
    );
    await expect(
      createSale(makeBaseInput({
        lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 10 }],
      }))
    ).rejects.toThrow('Insufficient stock');
  });
});

describe('createSale — pricing', () => {
  it('calculates correct totals for simple sale', async () => {
    // 3 pieces × 500p = 1500p
    await createSale(makeBaseInput({
      lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 3 }],
    }));

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.totalPence).toBe(1500);
    expect(createCall.data.subtotalPence).toBe(1500);
  });

  it('applies line discount correctly', async () => {
    // 2 pieces × 500p = 1000p, 10% discount = 100p off → net 900p
    await createSale(makeBaseInput({
      lines: [{
        productId: PRODUCT_ID,
        unitId: UNIT_ID,
        qtyInUnit: 2,
        discountType: 'PERCENT',
        discountValue: 10,
      }],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.subtotalPence).toBe(900);
    expect(createCall.data.totalPence).toBe(900);
  });

  it('applies promo buy-X-get-Y', async () => {
    // Buy 2 get 1 free. Sell 3 → 1 free unit (worth 500p)
    // Gross = 3 × 500 = 1500p, promo discount = 500p, net = 1000p
    prismaMock.productUnit.findMany.mockResolvedValue([
      makeProductUnit({ product: { promoBuyQty: 2, promoGetQty: 1 } }),
    ]);

    // Use paymentStatus 'PAID' with no explicit payments — the fallback
    // in createSale will auto-create a CASH payment for the exact total.
    await createSale(makeBaseInput({
      lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 3 }],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.subtotalPence).toBe(1000);
    expect(createCall.data.totalPence).toBe(1000);
  });
});

describe('createSale — VAT', () => {
  it('calculates VAT when enabled', async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      id: BIZ_ID,
      vatEnabled: true,
      currency: 'GHS',
      requireOpenTillForSales: false,
      discountApprovalThresholdBps: 5000,
    });
    // 2 × 500p = 1000p net, VAT 15% (1500 bps) = 150p, total = 1150p
    await createSale(makeBaseInput({
      lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 2 }],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.subtotalPence).toBe(1000);
    expect(createCall.data.vatPence).toBe(150);
    expect(createCall.data.totalPence).toBe(1150);
  });

  it('skips VAT when disabled', async () => {
    // vatEnabled is false by default in beforeEach
    await createSale(makeBaseInput({
      lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 2 }],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.vatPence).toBe(0);
    expect(createCall.data.totalPence).toBe(1000);
  });
});

describe('createSale — payments & stock', () => {
  it('creates cash drawer entry when cash payment with open shift', async () => {
    const shift = { id: 'shift-1', expectedCashPence: 5000 };
    getOpenShiftForTillMock.mockResolvedValue(shift);

    await createSale(makeBaseInput({
      payments: [{ method: 'CASH', amountPence: 500 }],
      lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 1 }],
    }));

    // Sales code uses tx.cashDrawerEntry.create directly inside the transaction
    expect((prismaMock as any).cashDrawerEntry.create).toHaveBeenCalledTimes(1);
    const drawerCall = (prismaMock as any).cashDrawerEntry.create.mock.calls[0][0];
    expect(drawerCall.data.amountPence).toBe(500);
    expect(drawerCall.data.entryType).toBe('CASH_SALE');
  });

  it('decrements inventory after sale', async () => {
    await createSale(makeBaseInput({
      lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 3 }],
    }));

    // decrementInventoryBalance should be called with qty to subtract
    expect(decrementInventoryBalanceMock).toHaveBeenCalled();
    const call = decrementInventoryBalanceMock.mock.calls[0];
    // args: tx, storeId, productId, qtyBase
    expect(call[1]).toBe(STORE_ID);
    expect(call[2]).toBe(PRODUCT_ID);
    expect(call[3]).toBe(3); // atomic decrement by 3
  });

  it('posts journal entry for sale', async () => {
    await createSale(makeBaseInput());

    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    const journalCall = postJournalEntryMock.mock.calls[0][0];
    expect(journalCall.businessId).toBe(BIZ_ID);
    expect(journalCall.referenceType).toBe('SALES_INVOICE');
  });

  it('requires customer for credit sales', async () => {
    await expect(
      createSale(makeBaseInput({
        paymentStatus: 'UNPAID',
        payments: [],
        customerId: undefined,
      }))
    ).rejects.toThrow('Customer is required');
  });
});
