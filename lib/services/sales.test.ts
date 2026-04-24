import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  prismaMock,
  postJournalEntryMock,
  fetchInventoryMapMock,
  decrementInventoryBalanceMock,
  batchDecrementInventoryBalanceMock,
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
    salesInvoice: { create: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    stockMovement: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
  fetchInventoryMapMock: vi.fn(),
  decrementInventoryBalanceMock: vi.fn(),
  batchDecrementInventoryBalanceMock: vi.fn(),
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
    batchDecrementInventoryBalance: batchDecrementInventoryBalanceMock,
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

type PricingMatrixCase = {
  name: string;
  vatEnabled: boolean;
  qtyInUnit: number;
  conversionToBase: number;
  basePricePence: number;
  configuredUnitPricePence?: number;
  overrideUnitPricePence?: number;
  defaultCostBasePence: number;
  avgCostBasePence: number;
  promoBuyQty?: number;
  promoGetQty?: number;
  discountType?: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountValue?: number;
  orderDiscountType?: 'NONE' | 'PERCENT' | 'AMOUNT';
  orderDiscountValue?: number;
  vatRateBps?: number;
};

function discountFor(subtotal: number, type: PricingMatrixCase['discountType'], value?: number) {
  if (!subtotal || !type || type === 'NONE') return 0;
  if (type === 'PERCENT') return Math.round((subtotal * Math.min(Math.max(value ?? 0, 0), 100)) / 100);
  return Math.min(Math.max(value ?? 0, 0), subtotal);
}

function baseValueForUnit(totalUnitPence: number, conversionToBase: number, qtyBase: number) {
  if (qtyBase <= 0) return 0;
  if (conversionToBase <= 1) return totalUnitPence * qtyBase;
  return Math.round((totalUnitPence * qtyBase) / conversionToBase);
}

function expectedPricingFor(testCase: PricingMatrixCase) {
  const vatRateBps = testCase.vatRateBps ?? 1500;
  const unitPricePence =
    testCase.overrideUnitPricePence ??
    testCase.configuredUnitPricePence ??
    testCase.basePricePence * testCase.conversionToBase;
  const qtyBase = testCase.qtyInUnit * testCase.conversionToBase;
  const lineSubtotal = unitPricePence * testCase.qtyInUnit;
  const lineDiscount = discountFor(lineSubtotal, testCase.discountType, testCase.discountValue);
  const promoGroup = (testCase.promoBuyQty ?? 0) + (testCase.promoGetQty ?? 0);
  const promoFreeBase =
    (testCase.promoBuyQty ?? 0) > 0 && (testCase.promoGetQty ?? 0) > 0 && promoGroup > 0
      ? Math.floor(qtyBase / promoGroup) * (testCase.promoGetQty ?? 0)
      : 0;
  const promoDiscount = Math.min(
    baseValueForUnit(unitPricePence, testCase.conversionToBase, promoFreeBase),
    Math.max(lineSubtotal - lineDiscount, 0),
  );
  const lineNetSubtotal = Math.max(lineSubtotal - lineDiscount - promoDiscount, 0);
  const lineVat = testCase.vatEnabled ? Math.round((lineNetSubtotal * vatRateBps) / 10000) : 0;
  const orderDiscount = discountFor(
    lineNetSubtotal,
    testCase.orderDiscountType,
    testCase.orderDiscountValue,
  );
  const invoiceSubtotal = Math.max(lineNetSubtotal - orderDiscount, 0);
  const vatRatio = testCase.vatEnabled && lineNetSubtotal > 0 ? invoiceSubtotal / lineNetSubtotal : 1;
  const invoiceVat = testCase.vatEnabled ? Math.round(lineVat * vatRatio) : 0;
  const cogs = testCase.avgCostBasePence * qtyBase;

  return {
    qtyBase,
    unitPricePence,
    lineSubtotal,
    lineDiscount,
    promoDiscount,
    lineNetSubtotal,
    lineVat,
    lineTotal: lineNetSubtotal + lineVat,
    orderDiscount,
    invoiceSubtotal,
    invoiceVat,
    invoiceTotal: invoiceSubtotal + invoiceVat,
    cogs,
  };
}

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
  prismaMock.salesInvoice.count.mockResolvedValue(0);
  prismaMock.salesInvoice.aggregate.mockResolvedValue({ _sum: { totalPence: 0 } });
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  prismaMock.salesInvoice.create.mockResolvedValue({
    id: 'inv-1',
    totalPence: 0,
    lines: [],
    payments: [],
  });
  prismaMock.stockMovement.createMany.mockResolvedValue({ count: 1 });
  // Additional tx models used inside the transaction
  (prismaMock as any).cashDrawerEntry = { create: vi.fn().mockResolvedValue({}) };
  (prismaMock as any).shift = { update: vi.fn().mockResolvedValue({}) };
  (prismaMock as any).inventoryBalance = { upsert: vi.fn().mockResolvedValue({}) };

  fetchInventoryMapMock.mockResolvedValue(
    new Map([[PRODUCT_ID, { qtyOnHandBase: 100, avgCostBasePence: 300 }]])
  );
  decrementInventoryBalanceMock.mockResolvedValue(97);
  batchDecrementInventoryBalanceMock.mockResolvedValue(undefined);
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
    ).rejects.toThrow('Insufficient on hand');
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

  it('uses explicit configured unit selling price when present', async () => {
    prismaMock.productUnit.findMany.mockResolvedValue([
      makeProductUnit({
        unitId: 'unit-half-pack',
        conversionToBase: 6,
        sellingPricePence: 2600,
      }),
    ]);

    await createSale(makeBaseInput({
      lines: [{ productId: PRODUCT_ID, unitId: 'unit-half-pack', qtyInUnit: 1 }],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.lines.create[0].unitPricePence).toBe(2600);
    expect(createCall.data.subtotalPence).toBe(2600);
    expect(createCall.data.totalPence).toBe(2600);
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

describe('createSale — pricing interaction matrix', () => {
  const matrix: PricingMatrixCase[] = [
    {
      name: 'multi-unit configured price with percent line discount, promo, order amount discount, no VAT',
      vatEnabled: false,
      qtyInUnit: 2,
      conversionToBase: 12,
      basePricePence: 500,
      configuredUnitPricePence: 5400,
      defaultCostBasePence: 300,
      avgCostBasePence: 250,
      promoBuyQty: 2,
      promoGetQty: 1,
      discountType: 'PERCENT',
      discountValue: 10,
      orderDiscountType: 'AMOUNT',
      orderDiscountValue: 500,
    },
    {
      name: 'multi-unit configured price with percent line discount, promo, order amount discount, and VAT',
      vatEnabled: true,
      qtyInUnit: 2,
      conversionToBase: 12,
      basePricePence: 500,
      configuredUnitPricePence: 5400,
      defaultCostBasePence: 300,
      avgCostBasePence: 250,
      promoBuyQty: 2,
      promoGetQty: 1,
      discountType: 'PERCENT',
      discountValue: 10,
      orderDiscountType: 'AMOUNT',
      orderDiscountValue: 500,
    },
    {
      name: 'mid-sale price override beats configured unit price inside the same VAT and promo path',
      vatEnabled: true,
      qtyInUnit: 2,
      conversionToBase: 12,
      basePricePence: 500,
      configuredUnitPricePence: 5400,
      overrideUnitPricePence: 6000,
      defaultCostBasePence: 300,
      avgCostBasePence: 250,
      promoBuyQty: 2,
      promoGetQty: 1,
      discountType: 'PERCENT',
      discountValue: 10,
      orderDiscountType: 'AMOUNT',
      orderDiscountValue: 500,
    },
    {
      name: 'amount line discount with base-derived multi-unit price and order percent discount',
      vatEnabled: true,
      qtyInUnit: 3,
      conversionToBase: 6,
      basePricePence: 420,
      defaultCostBasePence: 180,
      avgCostBasePence: 175,
      discountType: 'AMOUNT',
      discountValue: 700,
      orderDiscountType: 'PERCENT',
      orderDiscountValue: 5,
    },
    {
      name: 'promo discount is capped after a large amount line discount',
      vatEnabled: true,
      qtyInUnit: 1,
      conversionToBase: 12,
      basePricePence: 500,
      configuredUnitPricePence: 5400,
      defaultCostBasePence: 300,
      avgCostBasePence: 250,
      promoBuyQty: 1,
      promoGetQty: 11,
      discountType: 'AMOUNT',
      discountValue: 5000,
      orderDiscountType: 'NONE',
      orderDiscountValue: 0,
    },
  ];

  it.each(matrix)('$name', async (testCase) => {
    prismaMock.business.findUnique.mockResolvedValue({
      id: BIZ_ID,
      vatEnabled: testCase.vatEnabled,
      currency: 'GHS',
      requireOpenTillForSales: false,
      discountApprovalThresholdBps: 10000,
    });
    prismaMock.productUnit.findMany.mockResolvedValue([
      makeProductUnit({
        conversionToBase: testCase.conversionToBase,
        sellingPricePence: testCase.configuredUnitPricePence,
        product: {
          sellingPriceBasePence: testCase.basePricePence,
          defaultCostBasePence: testCase.defaultCostBasePence,
          vatRateBps: testCase.vatRateBps ?? 1500,
          promoBuyQty: testCase.promoBuyQty ?? 0,
          promoGetQty: testCase.promoGetQty ?? 0,
        },
      }),
    ]);
    fetchInventoryMapMock.mockResolvedValue(
      new Map([[PRODUCT_ID, { qtyOnHandBase: 1000, avgCostBasePence: testCase.avgCostBasePence }]])
    );

    await createSale(makeBaseInput({
      orderDiscountType: testCase.orderDiscountType,
      orderDiscountValue: testCase.orderDiscountValue,
      lines: [{
        productId: PRODUCT_ID,
        unitId: UNIT_ID,
        qtyInUnit: testCase.qtyInUnit,
        unitPricePence: testCase.overrideUnitPricePence,
        discountType: testCase.discountType,
        discountValue: testCase.discountValue,
      }],
    }));

    const expected = expectedPricingFor(testCase);
    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    const persistedLine = createCall.data.lines.create[0];

    expect(createCall.data.subtotalPence).toBe(expected.invoiceSubtotal);
    expect(createCall.data.discountPence).toBe(expected.orderDiscount);
    expect(createCall.data.vatPence).toBe(expected.invoiceVat);
    expect(createCall.data.totalPence).toBe(expected.invoiceTotal);
    expect(createCall.data.grossMarginPence).toBe(expected.invoiceSubtotal - expected.cogs);
    if (expected.invoiceTotal > 0) {
      expect(createCall.data.payments.create).toEqual([
        expect.objectContaining({
          method: 'CASH',
          amountPence: expected.invoiceTotal,
        }),
      ]);
    } else {
      expect(createCall.data.payments.create).toEqual([]);
    }

    expect(persistedLine).toMatchObject({
      qtyInUnit: testCase.qtyInUnit,
      conversionToBase: testCase.conversionToBase,
      qtyBase: expected.qtyBase,
      unitPricePence: expected.unitPricePence,
      lineDiscountPence: expected.lineDiscount,
      promoDiscountPence: expected.promoDiscount,
      lineSubtotalPence: expected.lineSubtotal,
      lineVatPence: expected.lineVat,
      lineTotalPence: expected.lineTotal,
      lineCostPence: expected.cogs,
    });

    expect(batchDecrementInventoryBalanceMock).toHaveBeenCalledWith(
      prismaMock,
      STORE_ID,
      expect.any(Map),
    );
    const decrements = batchDecrementInventoryBalanceMock.mock.calls[0][2] as Map<string, number>;
    expect(decrements.get(PRODUCT_ID)).toBe(expected.qtyBase);

    const journalLines = postJournalEntryMock.mock.calls[0][0].lines;
    if (expected.invoiceTotal > 0) {
      expect(journalLines).toEqual(
        expect.arrayContaining([{ accountCode: '1000', debitPence: expected.invoiceTotal }])
      );
    }
    expect(journalLines).toEqual(
      expect.arrayContaining([
        { accountCode: '4000', creditPence: expected.invoiceSubtotal },
        { accountCode: '5000', debitPence: expected.cogs },
        { accountCode: '1200', creditPence: expected.cogs },
      ])
    );
    if (testCase.vatEnabled && expected.invoiceVat > 0) {
      expect(journalLines).toEqual(
        expect.arrayContaining([{ accountCode: '2100', creditPence: expected.invoiceVat }])
      );
    } else {
      expect(journalLines.some((line: { accountCode: string }) => line.accountCode === '2100')).toBe(false);
    }
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

    expect(batchDecrementInventoryBalanceMock).toHaveBeenCalledTimes(1);
    const call = batchDecrementInventoryBalanceMock.mock.calls[0];
    expect(call[1]).toBe(STORE_ID);
    expect(call[2]).toBeInstanceOf(Map);
    expect(call[2].get(PRODUCT_ID)).toBe(3);
  });

  it('allows offline replay to sync even when inventory would go negative', async () => {
    fetchInventoryMapMock.mockResolvedValue(new Map());

    await createSale(makeBaseInput({
      inventoryPolicy: 'allow-negative',
      externalRef: 'OFFLINE_SYNC:offline-1',
      lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 3 }],
    }));

    expect(batchDecrementInventoryBalanceMock).not.toHaveBeenCalled();
    expect((prismaMock as any).inventoryBalance.upsert).toHaveBeenCalledWith({
      where: { storeId_productId: { storeId: STORE_ID, productId: PRODUCT_ID } },
      update: { qtyOnHandBase: -3, avgCostBasePence: 300 },
      create: { storeId: STORE_ID, productId: PRODUCT_ID, qtyOnHandBase: -3, avgCostBasePence: 300 },
    });
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

// ---------------------------------------------------------------------------
// Multi-line sales
// ---------------------------------------------------------------------------
describe('createSale — multi-line', () => {
  const PRODUCT_B = 'prod-2';
  const UNIT_B = 'unit-piece-b';

  it('aggregates two lines with heterogeneous VAT rates into the invoice totals', async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      id: BIZ_ID,
      vatEnabled: true,
      currency: 'GHS',
      requireOpenTillForSales: false,
      discountApprovalThresholdBps: 10000,
    });

    // Product A: 1000p @ 15% VAT = 150p VAT
    // Product B:  500p @  0% VAT =   0p VAT (zero-rated essentials)
    prismaMock.productUnit.findMany.mockResolvedValue([
      makeProductUnit({
        productId: PRODUCT_ID,
        unitId: UNIT_ID,
        product: {
          id: PRODUCT_ID,
          sellingPriceBasePence: 1000,
          defaultCostBasePence: 400,
          vatRateBps: 1500,
        },
      }),
      makeProductUnit({
        productId: PRODUCT_B,
        unitId: UNIT_B,
        product: {
          id: PRODUCT_B,
          sellingPriceBasePence: 500,
          defaultCostBasePence: 200,
          vatRateBps: 0,
        },
      }),
    ]);
    fetchInventoryMapMock.mockResolvedValue(
      new Map([
        [PRODUCT_ID, { qtyOnHandBase: 100, avgCostBasePence: 400 }],
        [PRODUCT_B, { qtyOnHandBase: 100, avgCostBasePence: 200 }],
      ])
    );

    await createSale(makeBaseInput({
      lines: [
        { productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 1 },
        { productId: PRODUCT_B, unitId: UNIT_B, qtyInUnit: 2 },
      ],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.subtotalPence).toBe(2000); // 1000 + 2×500
    expect(createCall.data.vatPence).toBe(150); // only A is VAT-rated
    expect(createCall.data.totalPence).toBe(2150);

    // Both products decremented
    const decrements = batchDecrementInventoryBalanceMock.mock.calls[0][2] as Map<string, number>;
    expect(decrements.get(PRODUCT_ID)).toBe(1);
    expect(decrements.get(PRODUCT_B)).toBe(2);

    // COGS adds both costs: 1×400 + 2×200 = 800
    const journalLines = postJournalEntryMock.mock.calls[0][0].lines;
    expect(journalLines).toEqual(
      expect.arrayContaining([
        { accountCode: '5000', debitPence: 800 },
        { accountCode: '1200', creditPence: 800 },
      ])
    );
  });

  it('applies order percent discount proportionally across mixed-VAT lines', async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      id: BIZ_ID,
      vatEnabled: true,
      currency: 'GHS',
      requireOpenTillForSales: false,
      discountApprovalThresholdBps: 10000,
    });

    prismaMock.productUnit.findMany.mockResolvedValue([
      makeProductUnit({
        productId: PRODUCT_ID,
        unitId: UNIT_ID,
        product: {
          id: PRODUCT_ID,
          sellingPriceBasePence: 1000,
          defaultCostBasePence: 400,
          vatRateBps: 1500,
        },
      }),
      makeProductUnit({
        productId: PRODUCT_B,
        unitId: UNIT_B,
        product: {
          id: PRODUCT_B,
          sellingPriceBasePence: 500,
          defaultCostBasePence: 200,
          vatRateBps: 0,
        },
      }),
    ]);
    fetchInventoryMapMock.mockResolvedValue(
      new Map([
        [PRODUCT_ID, { qtyOnHandBase: 100, avgCostBasePence: 400 }],
        [PRODUCT_B, { qtyOnHandBase: 100, avgCostBasePence: 200 }],
      ])
    );

    // 1×1000 + 2×500 = 2000 net. 10% order discount → 200 off → 1800 net.
    // Pre-discount VAT = 150 (only on A). After discount, vatRatio = 1800/2000 = 0.9.
    // Invoice VAT = round(150 × 0.9) = 135.
    await createSale(makeBaseInput({
      orderDiscountType: 'PERCENT',
      orderDiscountValue: 10,
      lines: [
        { productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 1 },
        { productId: PRODUCT_B, unitId: UNIT_B, qtyInUnit: 2 },
      ],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.subtotalPence).toBe(1800);
    expect(createCall.data.discountPence).toBe(200);
    expect(createCall.data.vatPence).toBe(135);
    expect(createCall.data.totalPence).toBe(1935);
  });
});

// ---------------------------------------------------------------------------
// Mixed payments + PART_PAID
// ---------------------------------------------------------------------------
describe('createSale — payments split & AR posting', () => {
  it('splits mixed cash + card payments across cash and bank journal accounts', async () => {
    // 5×500 = 2500p total; pay 1000 cash + 1500 card → no AR
    await createSale(makeBaseInput({
      payments: [
        { method: 'CASH', amountPence: 1000 },
        { method: 'CARD', amountPence: 1500 },
      ],
      lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 5 }],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.totalPence).toBe(2500);

    const journalLines = postJournalEntryMock.mock.calls[0][0].lines;
    expect(journalLines).toEqual(
      expect.arrayContaining([
        { accountCode: '1000', debitPence: 1000 }, // cash
        { accountCode: '1010', debitPence: 1500 }, // bank (card)
      ])
    );
    // No accounts receivable line when fully paid
    expect(journalLines.some((l: any) => l.accountCode === '1100')).toBe(false);
  });

  it('debits accounts receivable for the unpaid balance on PART_PAID', async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: 'cust-1', creditLimitPence: 100000 });

    // 10×500 = 5000p total; pay 2000 cash → 3000 on AR
    await createSale(makeBaseInput({
      paymentStatus: 'PART_PAID',
      customerId: 'cust-1',
      payments: [{ method: 'CASH', amountPence: 2000 }],
      lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 10 }],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.totalPence).toBe(5000);

    const journalLines = postJournalEntryMock.mock.calls[0][0].lines;
    expect(journalLines).toEqual(
      expect.arrayContaining([
        { accountCode: '1000', debitPence: 2000 }, // cash received
        { accountCode: '1100', debitPence: 3000 }, // AR for unpaid
        { accountCode: '4000', creditPence: 5000 }, // full revenue
      ])
    );
  });

  it('rejects overpayment that a non-cash refund cannot absorb', async () => {
    // 2×500 = 1000p; card 1500 → 500 overpayment with no cash to trim
    await expect(
      createSale(makeBaseInput({
        payments: [{ method: 'CARD', amountPence: 1500 }],
        lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 2 }],
      }))
    ).rejects.toThrow('Payment exceeds total due');
  });
});

// ---------------------------------------------------------------------------
// Discount approval threshold
// ---------------------------------------------------------------------------
describe('createSale — discount approval', () => {
  beforeEach(() => {
    // Tighten threshold to 10% so 50% line discount breaches it
    prismaMock.business.findUnique.mockResolvedValue({
      id: BIZ_ID,
      vatEnabled: false,
      currency: 'GHS',
      requireOpenTillForSales: false,
      discountApprovalThresholdBps: 1000,
    });
  });

  it('rejects an above-threshold discount with no approver', async () => {
    await expect(
      createSale(makeBaseInput({
        lines: [{
          productId: PRODUCT_ID,
          unitId: UNIT_ID,
          qtyInUnit: 2,
          discountType: 'PERCENT',
          discountValue: 50,
        }],
      }))
    ).rejects.toThrow('Manager discount PIN approval is required');
  });

  it('requires a reason when an approver is provided', async () => {
    await expect(
      createSale(makeBaseInput({
        discountApprovedByUserId: 'mgr-1',
        lines: [{
          productId: PRODUCT_ID,
          unitId: UNIT_ID,
          qtyInUnit: 2,
          discountType: 'PERCENT',
          discountValue: 50,
        }],
      }))
    ).rejects.toThrow('Discount reason is required');
  });

  it('passes when approver + reason are supplied and manager exists', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'mgr-1' });

    await expect(
      createSale(makeBaseInput({
        discountApprovedByUserId: 'mgr-1',
        discountOverrideReason: 'VIP customer loyalty',
        lines: [{
          productId: PRODUCT_ID,
          unitId: UNIT_ID,
          qtyInUnit: 2,
          discountType: 'PERCENT',
          discountValue: 50,
        }],
      }))
    ).resolves.toBeTruthy();

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    // 2×500 = 1000, 50% off = 500
    expect(createCall.data.totalPence).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Risk monitor fire-and-forget signals
// ---------------------------------------------------------------------------
describe('createSale — risk signals', () => {
  it('fires excessive-discount alert with real discount/gross figures', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'mgr-1' });
    prismaMock.business.findUnique.mockResolvedValue({
      id: BIZ_ID,
      vatEnabled: false,
      currency: 'GHS',
      requireOpenTillForSales: false,
      discountApprovalThresholdBps: 1000,
    });

    await createSale(makeBaseInput({
      discountApprovedByUserId: 'mgr-1',
      discountOverrideReason: 'VIP',
      lines: [{
        productId: PRODUCT_ID,
        unitId: UNIT_ID,
        qtyInUnit: 2,
        discountType: 'PERCENT',
        discountValue: 50,
      }],
    }));

    expect(detectExcessiveDiscountRiskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: BIZ_ID,
        discountPence: 500,
        grossSalesPence: 1000,
        thresholdBps: 1000,
      })
    );
  });

  it('fires negative-margin alert when selling below cost', async () => {
    // Cost 800p/base, selling at 500p → margin = -300 per unit × 2 = -600
    fetchInventoryMapMock.mockResolvedValue(
      new Map([[PRODUCT_ID, { qtyOnHandBase: 100, avgCostBasePence: 800 }]])
    );

    await createSale(makeBaseInput({
      lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 2 }],
    }));

    expect(detectNegativeMarginRiskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: BIZ_ID,
        grossMarginPence: expect.any(Number),
      })
    );
    const call = detectNegativeMarginRiskMock.mock.calls[0][0];
    expect(call.grossMarginPence).toBeLessThan(0);
  });

  it('does not fire negative-margin when margin is positive', async () => {
    // Cost 300, sell 500 → positive margin
    await createSale(makeBaseInput({
      lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 2 }],
    }));

    // detectNegativeMarginRisk is still called, but the real impl no-ops on >= 0.
    // Assert the call carried a non-negative margin so the real detector would exit early.
    expect(detectNegativeMarginRiskMock).toHaveBeenCalled();
    const call = detectNegativeMarginRiskMock.mock.calls[0][0];
    expect(call.grossMarginPence).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Discount clamping edge cases
// ---------------------------------------------------------------------------
describe('createSale — discount clamping', () => {
  it('clamps a percent line discount > 100 down to 100', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'mgr-1' });
    prismaMock.business.findUnique.mockResolvedValue({
      id: BIZ_ID,
      vatEnabled: false,
      currency: 'GHS',
      requireOpenTillForSales: false,
      discountApprovalThresholdBps: 10000, // permissive so approval isn't the thing under test
    });

    await createSale(makeBaseInput({
      lines: [{
        productId: PRODUCT_ID,
        unitId: UNIT_ID,
        qtyInUnit: 2,
        discountType: 'PERCENT',
        discountValue: 150, // must clamp to 100 → full discount
      }],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.totalPence).toBe(0);
    expect(createCall.data.subtotalPence).toBe(0);
    // Zero-total sales should not create a fallback cash payment
    expect(createCall.data.payments.create).toEqual([]);
  });

  it('clamps an amount line discount > subtotal down to subtotal', async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      id: BIZ_ID,
      vatEnabled: false,
      currency: 'GHS',
      requireOpenTillForSales: false,
      discountApprovalThresholdBps: 10000,
    });

    // 2×500 = 1000 subtotal; discount 5000 → clamp to 1000 → total 0
    await createSale(makeBaseInput({
      lines: [{
        productId: PRODUCT_ID,
        unitId: UNIT_ID,
        qtyInUnit: 2,
        discountType: 'AMOUNT',
        discountValue: 5000,
      }],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.totalPence).toBe(0);
  });

  it('clamps an order amount discount exceeding net subtotal to net (not below zero)', async () => {
    prismaMock.business.findUnique.mockResolvedValue({
      id: BIZ_ID,
      vatEnabled: false,
      currency: 'GHS',
      requireOpenTillForSales: false,
      discountApprovalThresholdBps: 10000,
    });

    // 2×500 = 1000 net; order discount 5000 → clamp to 1000 → invoice total 0
    await createSale(makeBaseInput({
      orderDiscountType: 'AMOUNT',
      orderDiscountValue: 5000,
      lines: [{ productId: PRODUCT_ID, unitId: UNIT_ID, qtyInUnit: 2 }],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.discountPence).toBe(1000);
    expect(createCall.data.subtotalPence).toBe(0);
    expect(createCall.data.totalPence).toBe(0);
  });

  it('treats a negative percent discount as zero (no discount)', async () => {
    await createSale(makeBaseInput({
      lines: [{
        productId: PRODUCT_ID,
        unitId: UNIT_ID,
        qtyInUnit: 2,
        discountType: 'PERCENT',
        discountValue: -25, // nonsense → must coerce to 0
      }],
    }));

    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.totalPence).toBe(1000); // full price
  });
});
