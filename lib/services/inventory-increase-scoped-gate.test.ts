/**
 * Service-level scoped-gate denials using the real flag helper (no mock).
 * Proves non-allowlisted / invalid-mode / cross-config requests create no durable records.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_CODES } from '@/lib/accounting';
import {
  INVENTORY_INCREASE_ERROR,
  createInventoryIncrease,
} from './inventory-increase';

const {
  prismaMock,
  postJournalEntryMock,
  ensureInventoryIncreaseAccountsMock,
  incrementInventoryBalanceQtyOnlyMock,
} = vi.hoisted(() => ({
  prismaMock: {
    store: { findFirst: vi.fn() },
    productUnit: { findFirst: vi.fn() },
    stockAdjustment: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    inventoryBalance: { findUnique: vi.fn() },
    stockMovement: { create: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
  ensureInventoryIncreaseAccountsMock: vi.fn(),
  incrementInventoryBalanceQtyOnlyMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/accounting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/accounting')>('@/lib/accounting');
  return {
    ...actual,
    postJournalEntry: postJournalEntryMock,
  };
});
vi.mock('@/lib/accounting-inventory-increase-accounts', () => ({
  ensureInventoryIncreaseAccounts: ensureInventoryIncreaseAccountsMock,
}));
vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    incrementInventoryBalanceQtyOnly: incrementInventoryBalanceQtyOnlyMock,
  };
});

const FLAG = 'TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE';
const ALLOW = 'TILLFLOW_INVENTORY_ADJUST_PHASE2_BUSINESS_IDS';
const MODE = 'TILLFLOW_INVENTORY_ADJUST_PHASE2_ROLLOUT_MODE';
const BIZ = 'cmscopedgatebiz00000000001';
const OTHER = 'cmscopedgatebiz00000000002';

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    businessId: BIZ,
    storeId: 'store-1',
    productId: 'prod-1',
    unitId: 'unit-1',
    qtyInUnit: 1,
    reasonCode: 'STOCK_FOUND' as const,
    reason: 'Found on shelf',
    idempotencyKey: 'idem-scoped-1',
    userId: 'user-1',
    userName: 'Owner',
    userRole: 'OWNER',
    ...overrides,
  };
}

function expectNoDurableSideEffects() {
  expect(prismaMock.$transaction).not.toHaveBeenCalled();
  expect(prismaMock.stockAdjustment.findUnique).not.toHaveBeenCalled();
  expect(prismaMock.stockAdjustment.create).not.toHaveBeenCalled();
  expect(prismaMock.stockMovement.create).not.toHaveBeenCalled();
  expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  expect(postJournalEntryMock).not.toHaveBeenCalled();
  expect(incrementInventoryBalanceQtyOnlyMock).not.toHaveBeenCalled();
}

describe('createInventoryIncrease scoped gate (real flag helper)', () => {
  const previousFlag = process.env[FLAG];
  const previousAllow = process.env[ALLOW];
  const previousMode = process.env[MODE];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'file:./dev.db';
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) =>
      fn(prismaMock),
    );
    prismaMock.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prismaMock.productUnit.findFirst.mockResolvedValue({ conversionToBase: 1 });
    prismaMock.stockAdjustment.findUnique.mockResolvedValue(null);
    prismaMock.inventoryBalance.findUnique.mockResolvedValue({
      qtyOnHandBase: 5,
      avgCostBasePence: 100,
    });
    ensureInventoryIncreaseAccountsMock.mockResolvedValue(
      new Map([
        [ACCOUNT_CODES.inventory, 'acc-1200'],
        [ACCOUNT_CODES.inventoryGain, 'acc-4100'],
      ]),
    );
  });

  afterEach(() => {
    if (previousFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previousFlag;
    if (previousAllow === undefined) delete process.env[ALLOW];
    else process.env[ALLOW] = previousAllow;
    if (previousMode === undefined) delete process.env[MODE];
    else process.env[MODE] = previousMode;
  });

  it('flag off + allowlisted business → denied, no durable records', async () => {
    delete process.env[FLAG];
    process.env[MODE] = 'ALLOWLIST';
    process.env[ALLOW] = BIZ;
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.FLAG_DISABLED,
    });
    expectNoDurableSideEffects();
  });

  it('flag on + mode missing → denied, no durable records', async () => {
    process.env[FLAG] = '1';
    delete process.env[MODE];
    process.env[ALLOW] = BIZ;
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.FLAG_DISABLED,
    });
    expectNoDurableSideEffects();
  });

  it('flag on + ALLOWLIST + business absent → denied, no durable records', async () => {
    process.env[FLAG] = '1';
    process.env[MODE] = 'ALLOWLIST';
    delete process.env[ALLOW];
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.FLAG_DISABLED,
    });
    expectNoDurableSideEffects();
  });

  it('flag on + ALLOWLIST + different business allowlisted → denied, no durable records', async () => {
    process.env[FLAG] = '1';
    process.env[MODE] = 'ALLOWLIST';
    process.env[ALLOW] = OTHER;
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.FLAG_DISABLED,
    });
    expectNoDurableSideEffects();
  });

  it('direct request for non-allowlisted business is denied even with crafted input', async () => {
    process.env[FLAG] = '1';
    process.env[MODE] = 'ALLOWLIST';
    process.env[ALLOW] = OTHER;
    await expect(
      createInventoryIncrease(baseInput({ businessId: BIZ, storeId: 'store-of-other' })),
    ).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.FLAG_DISABLED,
    });
    expectNoDurableSideEffects();
  });

  it('flag on + ALLOWLIST + exact business proceeds past the gate (then tenant checks apply)', async () => {
    process.env[FLAG] = '1';
    process.env[MODE] = 'ALLOWLIST';
    process.env[ALLOW] = BIZ;
    // Fail at tenant/store binding to prove we passed the gate but still enforce tenancy.
    prismaMock.store.findFirst.mockResolvedValue(null);
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.UNAUTHORISED,
    });
    expect(prismaMock.store.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'store-1', businessId: BIZ },
      }),
    );
    expect(prismaMock.stockAdjustment.create).not.toHaveBeenCalled();
  });

  it('flag on + GENERAL proceeds past the gate without allowlist membership', async () => {
    process.env[FLAG] = '1';
    process.env[MODE] = 'GENERAL';
    delete process.env[ALLOW];
    prismaMock.store.findFirst.mockResolvedValue(null);
    await expect(createInventoryIncrease(baseInput({ businessId: OTHER }))).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.UNAUTHORISED,
    });
    expect(prismaMock.store.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'store-1', businessId: OTHER },
      }),
    );
    expect(prismaMock.stockAdjustment.create).not.toHaveBeenCalled();
  });

  it('flag on + invalid mode fails closed even with allowlist', async () => {
    process.env[FLAG] = '1';
    process.env[MODE] = 'OPEN';
    process.env[ALLOW] = BIZ;
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.FLAG_DISABLED,
    });
    expectNoDurableSideEffects();
  });
});
