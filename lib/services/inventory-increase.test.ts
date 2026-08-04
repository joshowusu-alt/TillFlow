import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_CODES } from '@/lib/accounting';
import {
  INVENTORY_INCREASE_ERROR,
  INVENTORY_INCREASE_SCHEMA_VERSION,
  buildInventoryIncreasePayloadHash,
  checkedMul,
  createInventoryIncrease,
  InventoryIncreaseError,
  normalizeReasonText,
} from './inventory-increase';

const {
  prismaMock,
  postJournalEntryMock,
  ensureInventoryIncreaseAccountsMock,
  incrementInventoryBalanceQtyOnlyMock,
  isPhase2EnabledMock,
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
  isPhase2EnabledMock: vi.fn(() => true),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/inventory-increase-flag', () => ({
  isInventoryIncreasePhase2Enabled: isPhase2EnabledMock,
}));
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

const BIZ = 'biz-1';
const STORE = 'store-1';
const PRODUCT = 'prod-1';
const UNIT = 'unit-1';

function baseInput(overrides: Partial<Parameters<typeof createInventoryIncrease>[0]> = {}) {
  return {
    businessId: BIZ,
    storeId: STORE,
    productId: PRODUCT,
    unitId: UNIT,
    qtyInUnit: 2,
    reasonCode: 'PHYSICAL_COUNT_SURPLUS' as const,
    reason: 'Shelf count surplus',
    idempotencyKey: 'idem-inc-1',
    userId: 'user-1',
    userName: 'Owner',
    userRole: 'OWNER',
    ...overrides,
  };
}

function makeCreated(overrides: Record<string, unknown> = {}) {
  return {
    id: 'adj-inc-1',
    storeId: STORE,
    productId: PRODUCT,
    unitId: UNIT,
    qtyInUnit: 2,
    qtyBase: 2,
    reasonCode: 'PHYSICAL_COUNT_SURPLUS',
    reason: 'Shelf count surplus',
    idempotencyKey: 'idem-inc-1',
    payloadHash: 'hash',
    unitCostBasePence: 100,
    valuePence: 200,
    schemaVersion: INVENTORY_INCREASE_SCHEMA_VERSION,
    ...overrides,
  };
}

describe('inventory increase helpers', () => {
  it('normalizes reason text', () => {
    expect(normalizeReasonText('  Shelf   surplus  ')).toBe('Shelf surplus');
  });

  it('checkedMul rejects unsafe products', () => {
    expect(checkedMul(2, 3)).toBe(6);
    expect(() => checkedMul(Number.MAX_SAFE_INTEGER, 2)).toThrow(InventoryIncreaseError);
  });

  it('payloadHash changes when reason or correction link changes', () => {
    const a = buildInventoryIncreasePayloadHash({
      businessId: BIZ,
      storeId: STORE,
      productId: PRODUCT,
      unitId: UNIT,
      conversionToBase: 1,
      qtyBase: 2,
      reasonCode: 'STOCK_FOUND',
      normalizedReason: 'Found in store room',
      schemaVersion: 1,
      correctsAdjustmentId: null,
    });
    const b = buildInventoryIncreasePayloadHash({
      businessId: BIZ,
      storeId: STORE,
      productId: PRODUCT,
      unitId: UNIT,
      conversionToBase: 1,
      qtyBase: 2,
      reasonCode: 'STOCK_FOUND',
      normalizedReason: 'Different note',
      schemaVersion: 1,
      correctsAdjustmentId: null,
    });
    const c = buildInventoryIncreasePayloadHash({
      businessId: BIZ,
      storeId: STORE,
      productId: PRODUCT,
      unitId: UNIT,
      conversionToBase: 1,
      qtyBase: 2,
      reasonCode: 'STOCK_FOUND',
      normalizedReason: 'Found in store room',
      schemaVersion: 1,
      correctsAdjustmentId: 'adj-orig',
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('createInventoryIncrease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPhase2EnabledMock.mockReturnValue(true);
    process.env.DATABASE_URL = 'file:./dev.db';

    prismaMock.store.findFirst.mockResolvedValue({ id: STORE });
    prismaMock.productUnit.findFirst.mockResolvedValue({ conversionToBase: 1 });
    prismaMock.stockAdjustment.findUnique.mockResolvedValue(null);
    prismaMock.stockAdjustment.findFirst.mockResolvedValue(null);
    prismaMock.inventoryBalance.findUnique.mockResolvedValue({
      qtyOnHandBase: 10,
      avgCostBasePence: 100,
    });
    prismaMock.stockAdjustment.create.mockResolvedValue(makeCreated());
    prismaMock.stockMovement.create.mockResolvedValue({ id: 'mov-1' });
    prismaMock.stockMovement.findFirst.mockResolvedValue(null);
    prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    incrementInventoryBalanceQtyOnlyMock.mockResolvedValue(12);
    postJournalEntryMock.mockResolvedValue({ id: 'je-1' });
    ensureInventoryIncreaseAccountsMock.mockResolvedValue(
      new Map([
        [ACCOUNT_CODES.inventory, 'acc-1200'],
        [ACCOUNT_CODES.inventoryGain, 'acc-4100'],
      ]),
    );

    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) =>
      fn(prismaMock),
    );
  });

  it('rejects when the Phase 2 flag is off', async () => {
    isPhase2EnabledMock.mockReturnValue(false);
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.FLAG_DISABLED,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('Owner records PHYSICAL_COUNT_SURPLUS with Dr 1200 / Cr 4100', async () => {
    const result = await createInventoryIncrease(
      baseInput({ userRole: 'OWNER', reasonCode: 'PHYSICAL_COUNT_SURPLUS' }),
    );
    expect(result.replayed).toBe(false);
    expect(result.previousQtyBase).toBe(10);
    expect(result.newQtyBase).toBe(12);
    expect(result.qtyBase).toBe(2);
    expect(incrementInventoryBalanceQtyOnlyMock).toHaveBeenCalledWith(
      prismaMock,
      STORE,
      PRODUCT,
      2,
    );
    expect(postJournalEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          { accountCode: ACCOUNT_CODES.inventory, debitPence: 200 },
          { accountCode: ACCOUNT_CODES.inventoryGain, creditPence: 200 },
        ],
      }),
    );
    expect(ACCOUNT_CODES.inventoryGain).toBe('4100');
    expect(prismaMock.stockAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: 'INCREASE',
          qtyBase: 2,
          reasonCode: 'PHYSICAL_COUNT_SURPLUS',
        }),
      }),
    );
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          qtyBase: 2,
          beforeQtyBase: 10,
          afterQtyBase: 12,
          unitCostBasePence: 100,
        }),
      }),
    );
  });

  it('Manager records STOCK_FOUND', async () => {
    prismaMock.stockAdjustment.create.mockResolvedValue(
      makeCreated({ reasonCode: 'STOCK_FOUND', reason: 'Stock found' }),
    );
    const result = await createInventoryIncrease(
      baseInput({
        userRole: 'MANAGER',
        userName: 'Manager',
        reasonCode: 'STOCK_FOUND',
        reason: 'Stock found',
        idempotencyKey: 'idem-mgr',
      }),
    );
    expect(result.reasonCode).toBe('STOCK_FOUND');
  });

  it('denies Cashier', async () => {
    await expect(createInventoryIncrease(baseInput({ userRole: 'CASHIER' }))).rejects.toMatchObject(
      {
        code: INVENTORY_INCREASE_ERROR.UNAUTHORISED,
      },
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unsupported reason, empty note, zero and negative qty', async () => {
    await expect(
      createInventoryIncrease(baseInput({ reasonCode: 'OTHER_APPROVED' as any })),
    ).rejects.toMatchObject({ code: INVENTORY_INCREASE_ERROR.INVALID_ADJUSTMENT });
    await expect(createInventoryIncrease(baseInput({ reason: 'ab' }))).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.INVALID_ADJUSTMENT,
    });
    await expect(createInventoryIncrease(baseInput({ qtyInUnit: 0 }))).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.INVALID_ADJUSTMENT,
    });
    await expect(createInventoryIncrease(baseInput({ qtyInUnit: -3 }))).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.INVALID_ADJUSTMENT,
    });
  });

  it('rejects missing balance and zero/unknown average cost', async () => {
    prismaMock.inventoryBalance.findUnique.mockResolvedValue(null);
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.MISSING_BALANCE,
    });

    prismaMock.inventoryBalance.findUnique.mockResolvedValue({
      qtyOnHandBase: 0,
      avgCostBasePence: 0,
    });
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.MISSING_VALUATION,
    });
    expect(prismaMock.stockAdjustment.create).not.toHaveBeenCalled();
  });

  it('accepts zero on-hand quantity with retained average cost', async () => {
    prismaMock.inventoryBalance.findUnique.mockResolvedValue({
      qtyOnHandBase: 0,
      avgCostBasePence: 150,
    });
    incrementInventoryBalanceQtyOnlyMock.mockResolvedValue(2);
    prismaMock.stockAdjustment.create.mockResolvedValue(
      makeCreated({ unitCostBasePence: 150, valuePence: 300 }),
    );

    const result = await createInventoryIncrease(baseInput());
    expect(result.previousQtyBase).toBe(0);
    expect(result.newQtyBase).toBe(2);
    expect(postJournalEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          { accountCode: '1200', debitPence: 300 },
          { accountCode: '4100', creditPence: 300 },
        ],
      }),
    );
  });

  it('leaves average cost unchanged (qty-only increment helper)', async () => {
    await createInventoryIncrease(baseInput());
    expect(incrementInventoryBalanceQtyOnlyMock).toHaveBeenCalled();
    const source = readFileSync(join(process.cwd(), 'lib/services/inventory-increase.ts'), 'utf8');
    expect(source).toContain('incrementInventoryBalanceQtyOnly');
    expect(source).not.toMatch(/incrementInventoryBalance\(/);
  });

  it('rejects cross-tenant store and inactive/invalid product unit', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null);
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.UNAUTHORISED,
    });

    prismaMock.store.findFirst.mockResolvedValue({ id: STORE });
    prismaMock.productUnit.findFirst.mockResolvedValue(null);
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.UNAUTHORISED,
    });
  });

  it('replays same idempotency key + payload and rejects mismatch', async () => {
    const hash = buildInventoryIncreasePayloadHash({
      businessId: BIZ,
      storeId: STORE,
      productId: PRODUCT,
      unitId: UNIT,
      conversionToBase: 1,
      qtyBase: 2,
      reasonCode: 'PHYSICAL_COUNT_SURPLUS',
      normalizedReason: 'Shelf count surplus',
      schemaVersion: INVENTORY_INCREASE_SCHEMA_VERSION,
      correctsAdjustmentId: null,
    });
    prismaMock.stockAdjustment.findUnique.mockResolvedValue(makeCreated({ payloadHash: hash }));
    prismaMock.stockMovement.findFirst.mockResolvedValue({
      beforeQtyBase: 10,
      afterQtyBase: 12,
    });

    const replay = await createInventoryIncrease(baseInput());
    expect(replay.replayed).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();

    prismaMock.stockAdjustment.findUnique.mockResolvedValue(
      makeCreated({ payloadHash: 'other-hash' }),
    );
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.DUPLICATE_MISMATCH,
    });
  });

  it('recovers from unique-constraint race outside aborted transaction', async () => {
    const hash = buildInventoryIncreasePayloadHash({
      businessId: BIZ,
      storeId: STORE,
      productId: PRODUCT,
      unitId: UNIT,
      conversionToBase: 1,
      qtyBase: 2,
      reasonCode: 'PHYSICAL_COUNT_SURPLUS',
      normalizedReason: 'Shelf count surplus',
      schemaVersion: INVENTORY_INCREASE_SCHEMA_VERSION,
      correctsAdjustmentId: null,
    });
    prismaMock.$transaction.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['storeId', 'idempotencyKey'] },
    });
    prismaMock.stockAdjustment.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeCreated({ payloadHash: hash }));
    prismaMock.stockMovement.findFirst.mockResolvedValue({
      beforeQtyBase: 10,
      afterQtyBase: 12,
    });

    const result = await createInventoryIncrease(baseInput());
    expect(result.replayed).toBe(true);
  });

  it('maps incompatible account resolution to ACCOUNT_MAPPING_UNAVAILABLE', async () => {
    ensureInventoryIncreaseAccountsMock.mockRejectedValueOnce(
      new Error(
        'Account 4100 is configured as "Sales Revenue" (INCOME) but inventory increase requires "Inventory Gain & Surplus" (INCOME). Refusing to post to an incorrectly configured account.',
      ),
    );
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.ACCOUNT_MAPPING_UNAVAILABLE,
    });
    expect(postJournalEntryMock).not.toHaveBeenCalled();
  });

  it('rolls back conceptually when journal or audit fails', async () => {
    postJournalEntryMock.mockRejectedValueOnce(new Error('Unbalanced journal entry: 1 != 2'));
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.POSTING_FAILURE,
    });

    postJournalEntryMock.mockResolvedValue({ id: 'je' });
    prismaMock.auditLog.create.mockRejectedValueOnce(new Error('audit down'));
    await expect(createInventoryIncrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.AUDIT_FAILURE,
    });
  });

  it('never corrects an increase with another increase via correctsAdjustmentId', async () => {
    prismaMock.stockAdjustment.findFirst.mockResolvedValue({
      id: 'adj-orig',
      direction: 'INCREASE',
      qtyBase: 5,
    });
    await expect(
      createInventoryIncrease(
        baseInput({ correctsAdjustmentId: 'adj-orig', userRole: 'OWNER' }),
      ),
    ).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.CORRECTION_INVALID,
    });
  });

  it('Manager cannot post compensating correction linkage', async () => {
    await expect(
      createInventoryIncrease(
        baseInput({ userRole: 'MANAGER', correctsAdjustmentId: 'adj-orig' }),
      ),
    ).rejects.toMatchObject({
      code: INVENTORY_INCREASE_ERROR.UNAUTHORISED,
    });
  });

  it('locks with FOR UPDATE on Postgres before reading valuation', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/tillflow';
    const order: string[] = [];
    prismaMock.$queryRaw.mockImplementation(async () => {
      order.push('lock');
      return [{ qtyOnHandBase: 10, avgCostBasePence: 100 }];
    });
    prismaMock.stockAdjustment.create.mockImplementation(async (args: any) => {
      order.push('create');
      return makeCreated(args.data);
    });
    incrementInventoryBalanceQtyOnlyMock.mockImplementation(async () => {
      order.push('increment');
      return 12;
    });

    await createInventoryIncrease(baseInput());
    expect(order[0]).toBe('lock');
    expect(order.indexOf('lock')).toBeLessThan(order.indexOf('increment'));
    expect(prismaMock.inventoryBalance.findUnique).not.toHaveBeenCalled();
  });

  it('productUnit lookup does not select default cost', async () => {
    await createInventoryIncrease(baseInput());
    expect(prismaMock.productUnit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { conversionToBase: true },
      }),
    );
  });
});
