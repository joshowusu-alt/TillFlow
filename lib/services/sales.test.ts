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
