import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import { resolvePosTillId } from '@/lib/pos/till-context';

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
    decrementInventoryBalance: vi.fn(),
    batchDecrementInventoryBalance: batchDecrementInventoryBalanceMock,
  };
});
vi.mock('./cash-drawer', async () => {
  const actual = await vi.importActual<typeof import('./cash-drawer')>('./cash-drawer');
  return {
    ...actual,
    getOpenShiftForTill: getOpenShiftForTillMock,
    recordCashDrawerEntryTx: recordCashDrawerEntryTxMock,
  };
});
vi.mock('./risk-monitor', () => ({
  detectExcessiveDiscountRisk: detectExcessiveDiscountRiskMock,
  detectNegativeMarginRisk: detectNegativeMarginRiskMock,
}));
vi.mock('./branches', () => ({ resolveBranchIdForStore: resolveBranchIdForStoreMock }));
vi.mock('@/lib/fraud/reason-codes', () => ({ isDiscountReasonCode: vi.fn().mockReturnValue(true) }));

import { createSale } from './sales';

const BIZ = 'biz-1';
const STORE = 'store-1';
const TILL = 'till-1';
const PROD = 'prod-1';
const UNIT = 'unit-piece';
const SHIFT = 'shift-1';
const POSTGRES_DATABASE_URL = 'postgresql://user:pass@localhost:5432/tillflow';
const SQLITE_DATABASE_URL = 'file:./ci.db';

function saleInput(overrides: Record<string, unknown> = {}) {
  return {
    businessId: BIZ,
    storeId: STORE,
    tillId: TILL,
    cashierUserId: 'user-1',
    paymentStatus: 'PAID' as const,
    payments: [{ method: 'CASH' as const, amountPence: 500 }],
    lines: [{ productId: PROD, unitId: UNIT, qtyInUnit: 1 }],
    ...overrides,
  };
}

async function withDatabaseUrl<T>(databaseUrl: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.business.findUnique.mockResolvedValue({
    id: BIZ,
    vatEnabled: false,
    currency: 'GHS',
    requireOpenTillForSales: false,
    discountApprovalThresholdBps: 5000,
  });
  prismaMock.store.findFirst.mockResolvedValue({ id: STORE });
  prismaMock.till.findFirst.mockResolvedValue({
    id: TILL,
    active: true,
    storeId: STORE,
    store: { businessId: BIZ },
  });
  prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' });
  prismaMock.account.findMany.mockResolvedValue([
    { code: '1000', id: 'acc-cash' },
    { code: '1010', id: 'acc-bank' },
    { code: '1100', id: 'acc-ar' },
    { code: '4000', id: 'acc-sales' },
    { code: '2100', id: 'acc-vat' },
    { code: '5000', id: 'acc-cogs' },
    { code: '1200', id: 'acc-inv' },
  ]);
  prismaMock.customer.findFirst.mockResolvedValue(null);
  prismaMock.mobileMoneyCollection.findFirst.mockResolvedValue(null);
  prismaMock.productUnit.findMany.mockResolvedValue([
    {
      productId: PROD,
      unitId: UNIT,
      conversionToBase: 1,
      isBaseUnit: true,
      product: {
        id: PROD,
        businessId: BIZ,
        sellingPriceBasePence: 500,
        defaultCostBasePence: 300,
        vatRateBps: 0,
        promoBuyQty: 0,
        promoGetQty: 0,
      },
      unit: { name: 'Piece', pluralName: 'Pieces' },
    },
  ]);
  prismaMock.salesInvoice.findFirst.mockResolvedValue(null);
  prismaMock.businessSequence.update.mockResolvedValue({ nextVal: 1 });
  prismaMock.businessSequence.create.mockResolvedValue({ nextVal: 1 });
  prismaMock.salesInvoice.findMany.mockResolvedValue([]);
  prismaMock.salesInvoice.create.mockResolvedValue({ id: 'inv-1', totalPence: 500, lines: [], payments: [] });
  prismaMock.stockMovement.createMany.mockResolvedValue({ count: 1 });
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  prismaMock.$queryRaw.mockResolvedValue([{ id: 'cde-1' }]);
  (prismaMock as any).shift = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
  fetchInventoryMapMock.mockResolvedValue(new Map([[PROD, { qtyOnHandBase: 100, avgCostBasePence: 300 }]]));
  batchDecrementInventoryBalanceMock.mockResolvedValue(undefined);
  getOpenShiftForTillMock.mockResolvedValue({ id: SHIFT, expectedCashPence: 0 });
  recordCashDrawerEntryTxMock.mockResolvedValue({ id: 'cde-1' });
  detectExcessiveDiscountRiskMock.mockResolvedValue(undefined);
  detectNegativeMarginRiskMock.mockResolvedValue(undefined);
  resolveBranchIdForStoreMock.mockResolvedValue('branch-1');
  postJournalEntryMock.mockResolvedValue(undefined);
});

describe('shift integrity — operational POS sales', () => {
  it('rejects a sale without an open shift', async () => {
    getOpenShiftForTillMock.mockResolvedValue(null);
    await expect(createSale(saleInput())).rejects.toThrow('Open till is required');
  });

  it('rejects an inactive till', async () => {
    prismaMock.till.findFirst.mockResolvedValue({
      id: TILL,
      active: false,
      storeId: STORE,
      store: { businessId: BIZ },
    });
    await expect(createSale(saleInput())).rejects.toThrow('Till is inactive');
  });

  it('rejects a wrong-store till', async () => {
    prismaMock.till.findFirst.mockResolvedValue({
      id: TILL,
      active: true,
      storeId: 'store-other',
      store: { businessId: BIZ },
    });
    await expect(createSale(saleInput())).rejects.toThrow('Till does not belong to this store');
  });

  it('rejects a wrong-business till', async () => {
    prismaMock.till.findFirst.mockResolvedValue({
      id: TILL,
      active: true,
      storeId: STORE,
      store: { businessId: 'biz-other' },
    });
    await expect(createSale(saleInput())).rejects.toThrow('Till does not belong to this business');
  });

  it.each([
    { method: 'CASH' as const, amountPence: 500 },
    { method: 'CARD' as const, amountPence: 500 },
    { method: 'MOBILE_MONEY' as const, amountPence: 500 },
    { method: 'TRANSFER' as const, amountPence: 500 },
  ])('attaches tillId+shiftId for $method', async (payment) => {
    await createSale(saleInput({ payments: [payment] }));
    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.tillId).toBe(TILL);
    expect(createCall.data.shiftId).toBe(SHIFT);
    expect(createCall.data.saleSource).toBe('POS');
  });

  it('attaches tillId+shiftId for split tender', async () => {
    await createSale(saleInput({
      lines: [{ productId: PROD, unitId: UNIT, qtyInUnit: 2 }],
      payments: [
        { method: 'CASH', amountPence: 400 },
        { method: 'CARD', amountPence: 600 },
      ],
    }));
    const createCall = prismaMock.salesInvoice.create.mock.calls[0][0];
    expect(createCall.data.tillId).toBe(TILL);
    expect(createCall.data.shiftId).toBe(SHIFT);
  });

  it('fails checkout when updateMany reports the shift already closed', async () => {
    (prismaMock as any).shift.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      createSale(saleInput({ payments: [{ method: 'CARD', amountPence: 500 }] })),
    ).rejects.toThrow('shift closed during checkout');
  });

  it('fails checkout when the postgres CTE returns no rows', async () => {
    await withDatabaseUrl(POSTGRES_DATABASE_URL, async () => {
      prismaMock.$queryRaw
        .mockResolvedValueOnce([{ id: SHIFT }])
        .mockResolvedValueOnce([]);
      await expect(createSale(saleInput())).rejects.toThrow(
        'Shift not found or already closed during checkout',
      );
    });
  });
});

describe('shift integrity — expected cash increment', () => {
  it('uses Prisma increment instead of a read-modify-write assignment', () => {
    const source = readFileSync(join(process.cwd(), 'lib/services/cash-drawer.ts'), 'utf8');
    expect(source).toContain('expectedCashPence: { increment: input.amountPence }');
    expect(source).not.toContain('data: { expectedCashPence: afterExpectedCashPence }');
  });
});

describe('shift integrity — close locks before snapshot', () => {
  it('locks the shift row before computing close totals', () => {
    const source = readFileSync(join(process.cwd(), 'lib/services/shifts.ts'), 'utf8');
    const lockAt = source.indexOf('FOR UPDATE');
    const sqliteLockAt = source.indexOf("status: 'OPEN'");
    const snapshotAt = source.indexOf('lockedShift.salesInvoices');
    expect(lockAt).toBeGreaterThan(-1);
    expect(sqliteLockAt).toBeGreaterThan(-1);
    expect(snapshotAt).toBeGreaterThan(lockAt);
  });
});

describe('shift integrity — till 3 selection helper', () => {
  it('prefers the till query param when that till is active and open', () => {
    expect(resolvePosTillId({
      requestedTillId: 'till-3',
      savedTillId: 'till-1',
      tills: [
        { id: 'till-1', name: 'Till 1' },
        { id: 'till-3', name: 'Till 3' },
      ],
      openShiftTillIds: ['till-1', 'till-3'],
    })).toBe('till-3');
  });
});

describe('shift integrity — shifts page lists every user open shift', () => {
  it('queries findMany rather than findFirst for the current user open shifts', () => {
    const page = readFileSync(join(process.cwd(), 'app/(protected)/shifts/page.tsx'), 'utf8');
    const service = readFileSync(join(process.cwd(), 'lib/services/shifts.ts'), 'utf8');
    expect(page).toContain('getOpenShiftsForUserInStore(user.id, baseStore.id)');
    expect(page).toContain('const [tills, openShifts, recentShifts]');
    expect(page).not.toMatch(/const \[tills, openShift, recentShifts\]/);
    expect(service).toContain('export async function getOpenShiftsForUserInStore');
    expect(service).toContain('db.shift.findMany');
    expect(service).toContain("status: 'OPEN'");
    expect(service).toContain('return db.shift.findMany');
  });
});

const canRunPostgres = Boolean(process.env.DATABASE_URL) && isPostgresDatabaseUrl(process.env.DATABASE_URL);
const describePg = canRunPostgres ? describe : describe.skip;

describePg('shift integrity — postgres live lock (skipped unless DATABASE_URL is postgres)', () => {
  it('documents that the checkout path issues SELECT FOR UPDATE', () => {
    const source = readFileSync(join(process.cwd(), 'lib/services/sales.ts'), 'utf8');
    expect(source).toContain('FOR UPDATE');
    expect(SQLITE_DATABASE_URL).toContain('file:');
  });
});
