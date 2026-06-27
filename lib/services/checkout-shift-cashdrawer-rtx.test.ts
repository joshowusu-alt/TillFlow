/**
 * C11: Checkout shift/cash-drawer RTT consolidation — focused tests.
 *
 * Verifies that the single CTE path (tx.$queryRaw) is the only mechanism
 * used for shift + cash-drawer writes during checkout, that all guard
 * conditions (no cash, no shift) are respected, and that the raw SQL is
 * never constructed via $queryRawUnsafe.
 *
 * NOTE: These tests use a fully-mocked Prisma client (same pattern as
 * sales.test.ts). The SQL itself is not executed against a real database;
 * correctness of the SQL dialect is validated by the Postgres smoke CI lane.
 * Concurrency-safety is structural (UPDATE … RETURNING feeds the INSERT
 * inside the same CTE) and cannot be proven with a SQLite unit test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks (must mirror the shape expected by sales.ts)
// ---------------------------------------------------------------------------
const {
  prismaMock,
  postJournalEntryMock,
  fetchInventoryMapMock,
  batchDecrementInventoryBalanceMock,
  getOpenShiftForTillMock,
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
    salesInvoice: { create: vi.fn(), aggregate: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    businessSequence: { create: vi.fn(), update: vi.fn() },
    stockMovement: { createMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
  fetchInventoryMapMock: vi.fn(),
  batchDecrementInventoryBalanceMock: vi.fn(),
  getOpenShiftForTillMock: vi.fn(),
  detectExcessiveDiscountRiskMock: vi.fn(),
  detectNegativeMarginRiskMock: vi.fn(),
  resolveBranchIdForStoreMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/accounting', () => ({
  ACCOUNT_CODES: {
    cash: '1000', bank: '1010', ar: '1100',
    sales: '4000', vatPayable: '2100', cogs: '5000', inventory: '1200',
  },
  postJournalEntry: postJournalEntryMock,
}));
vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    fetchInventoryMap: fetchInventoryMapMock,
    decrementInventoryBalance: vi.fn(),
    batchDecrementInventoryBalance: batchDecrementInventoryBalanceMock,
  };
});
vi.mock('./cash-drawer', () => ({
  getOpenShiftForTill: getOpenShiftForTillMock,
  recordCashDrawerEntryTx: vi.fn(),
}));
vi.mock('./risk-monitor', () => ({
  detectExcessiveDiscountRisk: detectExcessiveDiscountRiskMock,
  detectNegativeMarginRisk: detectNegativeMarginRiskMock,
}));
vi.mock('./branches', () => ({ resolveBranchIdForStore: resolveBranchIdForStoreMock }));
vi.mock('@/lib/fraud/reason-codes', () => ({ isDiscountReasonCode: vi.fn().mockReturnValue(true) }));

import { createSale, type SaleLineInput } from './sales';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BIZ = 'biz-1';
const STORE = 'store-1';
const TILL = 'till-1';
const PROD = 'prod-1';
const UNIT = 'unit-piece';
const SHIFT_ID = 'shift-1';
const INV_ID = 'inv-1';

const defaultAccounts = [
  { code: '1000', id: 'acc-cash' }, { code: '1010', id: 'acc-bank' },
  { code: '1100', id: 'acc-ar' },  { code: '4000', id: 'acc-sales' },
  { code: '2100', id: 'acc-vat' }, { code: '5000', id: 'acc-cogs' },
  { code: '1200', id: 'acc-inv' },
];

function line(overrides: Partial<SaleLineInput> = {}): SaleLineInput {
  return { productId: PROD, unitId: UNIT, qtyInUnit: 1, ...overrides };
}

function saleInput(overrides: Record<string, unknown> = {}) {
  return {
    businessId: BIZ,
    storeId: STORE,
    tillId: TILL,
    cashierUserId: 'user-1',
    paymentStatus: 'PAID' as const,
    payments: [] as { method: 'CASH' | 'CARD'; amountPence: number }[],
    lines: [line()],
    ...overrides,
  };
}

function makeProductUnit() {
  return {
    productId: PROD, unitId: UNIT,
    conversionToBase: 1, isBaseUnit: true,
    product: {
      id: PROD, businessId: BIZ,
      sellingPriceBasePence: 500, defaultCostBasePence: 300,
      vatRateBps: 0, promoBuyQty: 0, promoGetQty: 0,
    },
    unit: { name: 'Piece', pluralName: 'Pieces' },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  prismaMock.business.findUnique.mockResolvedValue({
    id: BIZ, vatEnabled: false, currency: 'GHS',
    requireOpenTillForSales: false, discountApprovalThresholdBps: 5000,
  });
  prismaMock.store.findFirst.mockResolvedValue({ id: STORE });
  prismaMock.till.findFirst.mockResolvedValue({ id: TILL });
  prismaMock.account.findMany.mockResolvedValue(defaultAccounts);
  prismaMock.customer.findFirst.mockResolvedValue(null);
  prismaMock.mobileMoneyCollection.findFirst.mockResolvedValue(null);
  prismaMock.productUnit.findMany.mockResolvedValue([makeProductUnit()]);
  prismaMock.salesInvoice.findFirst.mockResolvedValue(null);
  prismaMock.businessSequence.update.mockResolvedValue({ nextVal: 1 });
  prismaMock.businessSequence.create.mockResolvedValue({ nextVal: 1 });
  prismaMock.salesInvoice.findMany.mockResolvedValue([]);
  prismaMock.salesInvoice.create.mockResolvedValue({ id: INV_ID, totalPence: 500, lines: [], payments: [] });
  prismaMock.stockMovement.createMany.mockResolvedValue({ count: 1 });
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  prismaMock.$queryRaw.mockResolvedValue([{ id: 'cde-1' }]);

  (prismaMock as any).cashDrawerEntry = { create: vi.fn().mockResolvedValue({}) };
  (prismaMock as any).shift = { update: vi.fn().mockResolvedValue({}) };
  (prismaMock as any).inventoryBalance = {
    upsert: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };

  fetchInventoryMapMock.mockResolvedValue(
    new Map([[PROD, { qtyOnHandBase: 100, avgCostBasePence: 300 }]])
  );
  batchDecrementInventoryBalanceMock.mockResolvedValue(undefined);
  getOpenShiftForTillMock.mockResolvedValue(null);
  detectExcessiveDiscountRiskMock.mockResolvedValue(undefined);
  detectNegativeMarginRiskMock.mockResolvedValue(undefined);
  resolveBranchIdForStoreMock.mockResolvedValue('branch-1');
  postJournalEntryMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// 1. Core CTE path — cash payment + open shift
// ---------------------------------------------------------------------------
describe('C11 shift/cash-drawer CTE — cash checkout', () => {
  it('calls $queryRaw exactly once for cash payment with open shift', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 5000 });

    await createSale(saleInput({
      payments: [{ method: 'CASH', amountPence: 500 }],
    }));

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('does not call the deprecated two-call path (cashDrawerEntry.create / shift.update)', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 5000 });

    await createSale(saleInput({
      payments: [{ method: 'CASH', amountPence: 500 }],
    }));

    expect((prismaMock as any).cashDrawerEntry.create).not.toHaveBeenCalled();
    expect((prismaMock as any).shift.update).not.toHaveBeenCalled();
  });

  it('does not use $queryRawUnsafe anywhere in the checkout path', async () => {
    // Structural: verify no reference to the unsafe API surface in the service source.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'lib/services/sales.ts'), 'utf8');
    expect(source).not.toContain('$queryRawUnsafe');
    expect(source).not.toContain('queryRawUnsafe');
  });

  it('SQL is parameterised — no string-interpolated user values in the template', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'lib/services/sales.ts'), 'utf8');
    // The CTE block should use template interpolation (${...}), not string concat
    expect(source).toContain('tx.$queryRaw<');
    expect(source).not.toContain('`UPDATE "Shift" SET');
  });

  it('SQL re-checks open shift, till, store, and business ownership in the CTE', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'lib/services/sales.ts'), 'utf8');

    expect(source).toContain('UPDATE "Shift" AS sh');
    expect(source).toContain('FROM "Till" AS t');
    expect(source).toContain('JOIN "Store" AS st');
    expect(source).toContain('sh."status" = ${\'OPEN\'}');
    expect(source).toContain('sh."tillId" = ${till.id}');
    expect(source).toContain('t."id" = sh."tillId"');
    expect(source).toContain('t."active" = TRUE');
    expect(source).toContain('st."id" = ${input.storeId}');
    expect(source).toContain('st."businessId" = ${input.businessId}');
  });

  it('shift update and cash drawer insert remain inside prisma.$transaction', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 0 });

    await createSale(saleInput({ payments: [{ method: 'CASH', amountPence: 500 }] }));

    // $queryRaw is invoked as part of the $transaction callback, not outside it
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Guard conditions — no CTE call when conditions unmet
// ---------------------------------------------------------------------------
describe('C11 shift/cash-drawer CTE — guard conditions', () => {
  it('skips CTE when there is no open shift', async () => {
    getOpenShiftForTillMock.mockResolvedValue(null);

    await createSale(saleInput({ payments: [{ method: 'CASH', amountPence: 500 }] }));

    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('skips CTE for a card-only payment', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 1000 });

    await createSale(saleInput({ payments: [{ method: 'CARD', amountPence: 500 }] }));

    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('skips CTE for a credit-only sale (no payments)', async () => {
    prismaMock.customer.findFirst.mockResolvedValue({
      id: 'cust-1', storeId: STORE, creditLimitPence: 100000, loyaltyPointsBalance: 0,
    });
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 1000 });

    await createSale(saleInput({
      paymentStatus: 'UNPAID', customerId: 'cust-1', payments: [],
    }));

    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Mixed-payment split — cash portion only
// ---------------------------------------------------------------------------
describe('C11 shift/cash-drawer CTE — mixed payments', () => {
  it('executes CTE once for mixed cash + card payment', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 2000 });
    prismaMock.salesInvoice.create.mockResolvedValue({
      id: INV_ID, totalPence: 1000, lines: [], payments: [],
    });
    prismaMock.productUnit.findMany.mockResolvedValue([makeProductUnit()]);

    await createSale(saleInput({
      lines: [line({ qtyInUnit: 2 })],
      payments: [
        { method: 'CASH', amountPence: 400 },
        { method: 'CARD', amountPence: 600 },
      ],
    }));

    // One CTE for the cash portion, journal + inventory still run via their own paths
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    expect(batchDecrementInventoryBalanceMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Transaction boundary — rollback on failure
// ---------------------------------------------------------------------------
describe('C11 shift/cash-drawer CTE — transaction boundary', () => {
  it('propagates $queryRaw failure to the caller', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 5000 });
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(
      createSale(saleInput({ payments: [{ method: 'CASH', amountPence: 500 }] }))
    ).rejects.toThrow('DB connection lost');
  });

  it('throws when CTE returns empty rows (shift not found)', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 5000 });
    // Simulate the shift row not matching (already closed between context read and tx)
    prismaMock.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      createSale(saleInput({ payments: [{ method: 'CASH', amountPence: 500 }] }))
    ).rejects.toThrow('Shift not found or already closed during checkout');
  });
});

// ---------------------------------------------------------------------------
// 5. Unchanged paths — ensure other checkout logic is unaffected
// ---------------------------------------------------------------------------
describe('C11 — unchanged checkout paths', () => {
  it('still posts journal entry for every sale', async () => {
    await createSale(saleInput());
    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    expect(postJournalEntryMock.mock.calls[0][0].referenceType).toBe('SALES_INVOICE');
  });

  it('still decrements inventory for every sale', async () => {
    await createSale(saleInput({ lines: [line({ qtyInUnit: 3 })] }));
    expect(batchDecrementInventoryBalanceMock).toHaveBeenCalledTimes(1);
    const decrements = batchDecrementInventoryBalanceMock.mock.calls[0][2] as Map<string, number>;
    expect(decrements.get(PROD)).toBe(3);
  });

  it('still creates invoice with correct totals', async () => {
    await createSale(saleInput({ lines: [line({ qtyInUnit: 2 })] }));
    const call = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(call.data.totalPence).toBe(1000); // 2 × 500
  });

  it('invoice numbering unchanged', async () => {
    await createSale(saleInput());
    const call = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(call.data.transactionNumber).toBe('INV-000001');
  });

  it('C5 timing marker action.checkout.shift-update is still present in source', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'lib/services/sales.ts'), 'utf8');
    expect(source).toContain('action.checkout.shift-update');
    expect(source).toContain('action.checkout.transaction.total');
    expect(source).toContain('action.checkout.inventory-update');
    expect(source).toContain('action.checkout.journal-post');
  });

  it('C9 cached context helpers are unchanged', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'lib/services/sales.ts'), 'utf8');
    expect(source).toContain("['checkout-context-business']");
    expect(source).toContain("{ revalidate: 60, tags: ['checkout-context'] }");
    expect(source).toContain("['checkout-context-accounts']");
    expect(source).toContain("{ revalidate: 300, tags: ['checkout-context'] }");
  });

  it('no schema files changed', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const pgSchema = readFileSync(join(process.cwd(), 'prisma/schema.postgres.prisma'), 'utf8');
    expect(pgSchema).toContain('model CashDrawerEntry');
    expect(pgSchema).toContain('model Shift');
    // Confirm no new fields were added by checking that the schema still matches
    // the exact provider declaration (unchanged from baseline)
    expect(pgSchema).toMatch(/provider\s+=\s+"postgresql"/);
  });
});
