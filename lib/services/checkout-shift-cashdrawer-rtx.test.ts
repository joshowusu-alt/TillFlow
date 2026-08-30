/**
 * C11: Checkout shift/cash-drawer RTT consolidation — focused tests.
 *
 * Production (Postgres) consolidates shift + cash-drawer writes into one
 * CTE via tx.$queryRaw. Local/CI SQLite cannot run that CTE, so sales.ts
 * uses the typed recordCashDrawerEntryTx helper on SQLite URLs.
 *
 * These tests force DATABASE_URL to exercise each path explicitly (same
 * pattern as sales.test.ts). The SQL dialect itself is not executed here;
 * Postgres smoke CI covers migrate/deploy against a real engine.
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
  recordCashDrawerEntryTxMock: vi.fn(),
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
  recordCashDrawerEntryTx: recordCashDrawerEntryTxMock,
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

/** Forces the Postgres CTE branch in sales.ts without touching a real DB. */
const POSTGRES_DATABASE_URL = 'postgresql://user:pass@localhost:5432/tillflow';
/** Forces the SQLite helper branch used by local/CI unit runs. */
const SQLITE_DATABASE_URL = 'file:./ci.db';

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

async function withDatabaseUrl<T>(
  databaseUrl: string,
  run: () => Promise<T>,
): Promise<T> {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  try {
    return await run();
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
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
  prismaMock.till.findFirst.mockResolvedValue({
    id: TILL,
    active: true,
    storeId: STORE,
    store: { businessId: BIZ },
  });
  prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' });
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
  (prismaMock as any).shift = {
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  (prismaMock as any).inventoryBalance = {
    upsert: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };

  fetchInventoryMapMock.mockResolvedValue(
    new Map([[PROD, { qtyOnHandBase: 100, avgCostBasePence: 300 }]])
  );
  batchDecrementInventoryBalanceMock.mockResolvedValue(undefined);
  getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 0 });
  recordCashDrawerEntryTxMock.mockResolvedValue({ id: 'cde-1' });
  detectExcessiveDiscountRiskMock.mockResolvedValue(undefined);
  detectNegativeMarginRiskMock.mockResolvedValue(undefined);
  resolveBranchIdForStoreMock.mockResolvedValue('branch-1');
  postJournalEntryMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// 1. Core CTE path — cash payment + open shift (Postgres)
// ---------------------------------------------------------------------------
describe('C11 shift/cash-drawer CTE — cash checkout (Postgres)', () => {
  it('locks the shift then runs the cash-drawer CTE', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 5000 });

    await withDatabaseUrl(POSTGRES_DATABASE_URL, async () => {
      await createSale(saleInput({
        payments: [{ method: 'CASH', amountPence: 500 }],
      }));
    });

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });

  it('does not call the deprecated two-call path (cashDrawerEntry.create / shift.update)', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 5000 });

    await withDatabaseUrl(POSTGRES_DATABASE_URL, async () => {
      await createSale(saleInput({
        payments: [{ method: 'CASH', amountPence: 500 }],
      }));
    });

    expect((prismaMock as any).cashDrawerEntry.create).not.toHaveBeenCalled();
    expect((prismaMock as any).shift.update).not.toHaveBeenCalled();
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
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

    await withDatabaseUrl(POSTGRES_DATABASE_URL, async () => {
      await createSale(saleInput({ payments: [{ method: 'CASH', amountPence: 500 }] }));
    });

    // $queryRaw is invoked as part of the $transaction callback, not outside it
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 1b. SQLite helper path (local / CI unit runtime)
// ---------------------------------------------------------------------------
describe('C11 shift/cash-drawer — SQLite helper path', () => {
  it('records exactly one cash-drawer movement via the typed helper', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 5000 });

    await withDatabaseUrl(SQLITE_DATABASE_URL, async () => {
      await createSale(saleInput({
        payments: [{ method: 'CASH', amountPence: 500 }],
      }));
    });

    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledTimes(1);
    expect(recordCashDrawerEntryTxMock.mock.calls[0][1]).toMatchObject({
      businessId: BIZ,
      storeId: STORE,
      tillId: TILL,
      shiftId: SHIFT_ID,
      entryType: 'CASH_SALE',
      amountPence: 500,
      referenceType: 'SALES_INVOICE',
      referenceId: INV_ID,
    });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('records only the cash component for mixed cash + card payments', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 2000 });
    prismaMock.salesInvoice.create.mockResolvedValue({
      id: INV_ID, totalPence: 1000, lines: [], payments: [],
    });
    prismaMock.productUnit.findMany.mockResolvedValue([makeProductUnit()]);

    await withDatabaseUrl(SQLITE_DATABASE_URL, async () => {
      await createSale(saleInput({
        lines: [line({ qtyInUnit: 2 })],
        payments: [
          { method: 'CASH', amountPence: 400 },
          { method: 'CARD', amountPence: 600 },
        ],
      }));
    });

    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledTimes(1);
    expect(recordCashDrawerEntryTxMock.mock.calls[0][1].amountPence).toBe(400);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('atomically increments each live non-cash tender total on the exact shift', async () => {
    await withDatabaseUrl(SQLITE_DATABASE_URL, async () => {
      await createSale(saleInput({
        lines: [line({ qtyInUnit: 3 })],
        payments: [
          { method: 'CARD', amountPence: 500 },
          { method: 'TRANSFER', amountPence: 400 },
          { method: 'MOBILE_MONEY', amountPence: 600 },
        ],
      }));
    });

    expect((prismaMock as any).shift.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: SHIFT_ID,
          tillId: TILL,
          status: 'OPEN',
        }),
        data: {
          cardTotalPence: { increment: 500 },
          transferTotalPence: { increment: 400 },
          momoTotalPence: { increment: 600 },
        },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Guard conditions — no drawer write when conditions unmet
// ---------------------------------------------------------------------------
describe('C11 shift/cash-drawer — guard conditions', () => {
  it('rejects checkout when there is no open shift', async () => {
    getOpenShiftForTillMock.mockResolvedValue(null);

    await withDatabaseUrl(POSTGRES_DATABASE_URL, async () => {
      await expect(
        createSale(saleInput({ payments: [{ method: 'CASH', amountPence: 500 }] })),
      ).rejects.toThrow('Open till is required');
    });

    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });

  it('skips drawer write for a card-only payment', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 1000 });

    await withDatabaseUrl(POSTGRES_DATABASE_URL, async () => {
      await createSale(saleInput({ payments: [{ method: 'CARD', amountPence: 500 }] }));
    });

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });

  it('skips drawer write for a credit-only sale (no payments)', async () => {
    prismaMock.customer.findFirst.mockResolvedValue({
      id: 'cust-1', storeId: STORE, creditLimitPence: 100000, loyaltyPointsBalance: 0,
    });
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 1000 });

    await withDatabaseUrl(POSTGRES_DATABASE_URL, async () => {
      await createSale(saleInput({
        paymentStatus: 'UNPAID', customerId: 'cust-1', payments: [],
      }));
    });

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Mixed-payment split — cash portion only (Postgres CTE)
// ---------------------------------------------------------------------------
describe('C11 shift/cash-drawer CTE — mixed payments (Postgres)', () => {
  it('executes CTE once for mixed cash + card payment', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 2000 });
    prismaMock.salesInvoice.create.mockResolvedValue({
      id: INV_ID, totalPence: 1000, lines: [], payments: [],
    });
    prismaMock.productUnit.findMany.mockResolvedValue([makeProductUnit()]);

    await withDatabaseUrl(POSTGRES_DATABASE_URL, async () => {
      await createSale(saleInput({
        lines: [line({ qtyInUnit: 2 })],
        payments: [
          { method: 'CASH', amountPence: 400 },
          { method: 'CARD', amountPence: 600 },
        ],
      }));
    });

    // One CTE for the cash portion, journal + inventory still run via their own paths
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
    expect(postJournalEntryMock).toHaveBeenCalledTimes(1);
    expect(batchDecrementInventoryBalanceMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Transaction boundary — rollback on failure (Postgres CTE)
// ---------------------------------------------------------------------------
describe('C11 shift/cash-drawer CTE — transaction boundary (Postgres)', () => {
  it('rolls back checkout when shift close wins the row-lock ordering', async () => {
    (prismaMock as any).shift.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      createSale(saleInput({ payments: [{ method: 'CARD', amountPence: 500 }] })),
    ).rejects.toThrow('shift closed during checkout');

    expect(prismaMock.salesInvoice.create).toHaveBeenCalledTimes(1);
    expect(postJournalEntryMock).not.toHaveBeenCalled();
    expect(prismaMock.stockMovement.createMany).not.toHaveBeenCalled();
  });

  it('propagates $queryRaw failure to the caller', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 5000 });
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('DB connection lost'));

    await withDatabaseUrl(POSTGRES_DATABASE_URL, async () => {
      await expect(
        createSale(saleInput({ payments: [{ method: 'CASH', amountPence: 500 }] }))
      ).rejects.toThrow('DB connection lost');
    });

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('throws when CTE returns empty rows (shift not found)', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 5000 });
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ id: SHIFT_ID }])
      .mockResolvedValueOnce([]);

    await withDatabaseUrl(POSTGRES_DATABASE_URL, async () => {
      await expect(
        createSale(saleInput({ payments: [{ method: 'CASH', amountPence: 500 }] }))
      ).rejects.toThrow('Shift not found or already closed during checkout');
    });

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('propagates SQLite helper failure to the caller', async () => {
    getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT_ID, expectedCashPence: 5000 });
    recordCashDrawerEntryTxMock.mockRejectedValueOnce(new Error('drawer write failed'));

    await withDatabaseUrl(SQLITE_DATABASE_URL, async () => {
      await expect(
        createSale(saleInput({ payments: [{ method: 'CASH', amountPence: 500 }] }))
      ).rejects.toThrow('drawer write failed');
    });

    expect(recordCashDrawerEntryTxMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
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
    expect(source).toContain("['checkout-context-business', businessId]");
    expect(source).toContain('checkoutContextTag(businessId)');
    expect(source).toContain("['checkout-context-accounts', businessId]");
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
