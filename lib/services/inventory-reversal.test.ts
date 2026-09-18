import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_CODES } from '@/lib/accounting';
import {
  INVENTORY_REVERSAL_ERROR,
  INVENTORY_REVERSAL_SCHEMA_VERSION,
  buildInventoryReversalPayloadHash,
  buildReversalIdempotencyKey,
  oppositeAdjustmentDirection,
  reverseInventoryAdjustment,
} from './inventory-reversal';

const {
  prismaMock,
  postJournalEntryMock,
  ensureInventoryDecreaseAccountsMock,
  ensureInventoryIncreaseAccountsMock,
  decrementInventoryBalanceMock,
  incrementInventoryBalanceQtyOnlyMock,
  reserveNextDocumentNumberMock,
} = vi.hoisted(() => ({
  prismaMock: {
    store: { findFirst: vi.fn() },
    stockAdjustment: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    inventoryBalance: { findUnique: vi.fn() },
    stockMovement: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
  ensureInventoryDecreaseAccountsMock: vi.fn(),
  ensureInventoryIncreaseAccountsMock: vi.fn(),
  decrementInventoryBalanceMock: vi.fn(),
  incrementInventoryBalanceQtyOnlyMock: vi.fn(),
  reserveNextDocumentNumberMock: vi.fn().mockResolvedValue('ADJ-000042'),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/accounting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/accounting')>('@/lib/accounting');
  return { ...actual, postJournalEntry: postJournalEntryMock };
});
vi.mock('@/lib/accounting-inventory-decrease-accounts', () => ({
  ensureInventoryDecreaseAccounts: ensureInventoryDecreaseAccountsMock,
}));
vi.mock('@/lib/accounting-inventory-increase-accounts', () => ({
  ensureInventoryIncreaseAccounts: ensureInventoryIncreaseAccountsMock,
}));
vi.mock('@/lib/accounting-inventory-loss-5100', () => ({
  assertAccount5100SafeForInventoryLoss: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    decrementInventoryBalance: decrementInventoryBalanceMock,
    incrementInventoryBalanceQtyOnly: incrementInventoryBalanceQtyOnlyMock,
  };
});
vi.mock('@/lib/services/document-numbers', () => ({
  reserveNextDocumentNumber: reserveNextDocumentNumberMock,
}));

const BIZ = 'biz-1';
const STORE = 'store-1';
const PRODUCT = 'prod-1';
const UNIT = 'unit-1';
const ORIGINAL = 'adj-orig-1';

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    businessId: BIZ,
    storeId: STORE,
    originalAdjustmentId: ORIGINAL,
    reason: 'Posted to the wrong product',
    userId: 'user-1',
    userName: 'Owner',
    userRole: 'OWNER',
    ...overrides,
  };
}

function originalDecrease() {
  return {
    id: ORIGINAL,
    storeId: STORE,
    productId: PRODUCT,
    unitId: UNIT,
    qtyInUnit: 2,
    qtyBase: -2,
    direction: 'DECREASE',
    reasonCode: 'WASTAGE',
    reason: 'Floor wastage',
    reversalOfId: null,
    unitCostBasePence: 100,
    valuePence: 200,
    idempotencyKey: 'orig-key',
    payloadHash: 'orig-hash',
  };
}

function createdReversal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'adj-rev-1',
    storeId: STORE,
    productId: PRODUCT,
    unitId: UNIT,
    qtyInUnit: 2,
    qtyBase: 2,
    direction: 'INCREASE',
    reason: 'Reversal: Posted to the wrong product',
    reversalOfId: ORIGINAL,
    reversalReason: 'Posted to the wrong product',
    idempotencyKey: `${ORIGINAL}:REVERSAL`,
    payloadHash: 'hash',
    unitCostBasePence: 100,
    valuePence: 200,
    transactionNumber: 'ADJ-000042',
    ...overrides,
  };
}

describe('inventory reversal helpers', () => {
  it('derives a stable idempotency key from the original id', () => {
    expect(buildReversalIdempotencyKey(ORIGINAL)).toBe(`${ORIGINAL}:REVERSAL`);
  });

  it('posts the exact opposite direction', () => {
    expect(oppositeAdjustmentDirection('DECREASE')).toBe('INCREASE');
    expect(oppositeAdjustmentDirection('INCREASE')).toBe('DECREASE');
    expect(oppositeAdjustmentDirection('OUT')).toBe('INCREASE');
  });
});

describe('reverseInventoryAdjustment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'file:./dev.db';
    reserveNextDocumentNumberMock.mockResolvedValue('ADJ-000042');
    prismaMock.store.findFirst.mockResolvedValue({ id: STORE });
    prismaMock.stockAdjustment.findFirst.mockResolvedValue(originalDecrease());
    prismaMock.stockAdjustment.findUnique.mockResolvedValue(null);
    prismaMock.inventoryBalance.findUnique.mockResolvedValue({
      qtyOnHandBase: 10,
      avgCostBasePence: 100,
    });
    prismaMock.stockAdjustment.create.mockResolvedValue(createdReversal());
    prismaMock.stockMovement.create.mockResolvedValue({ id: 'mov-1' });
    prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    incrementInventoryBalanceQtyOnlyMock.mockResolvedValue(12);
    decrementInventoryBalanceMock.mockResolvedValue(8);
    postJournalEntryMock.mockResolvedValue({ id: 'je-1' });
    ensureInventoryDecreaseAccountsMock.mockResolvedValue(
      new Map([
        [ACCOUNT_CODES.inventory, 'acc-1200'],
        [ACCOUNT_CODES.inventoryLoss, 'acc-5100'],
      ]),
    );
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

  it('reverses a decrease once with ADJUSTMENT_REVERSAL and ADJ- number', async () => {
    const result = await reverseInventoryAdjustment(baseInput());
    expect(result.replayed).toBe(false);
    expect(result.id).toBe('adj-rev-1');
    expect(incrementInventoryBalanceQtyOnlyMock).toHaveBeenCalledWith(prismaMock, STORE, PRODUCT, 2);
    expect(prismaMock.stockAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reversalOfId: ORIGINAL,
          direction: 'INCREASE',
          idempotencyKey: `${ORIGINAL}:REVERSAL`,
          transactionNumber: 'ADJ-000042',
        }),
      }),
    );
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ADJUSTMENT_REVERSAL',
          referenceType: 'STOCK_ADJUSTMENT',
          referenceId: 'adj-rev-1',
          qtyBase: 2,
        }),
      }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it('rejects a second reverse of the same original', async () => {
    prismaMock.stockAdjustment.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        createdReversal({
          payloadHash: 'different',
        }),
      );
    await expect(reverseInventoryAdjustment(baseInput())).rejects.toMatchObject({
      code: INVENTORY_REVERSAL_ERROR.ALREADY_REVERSED,
    });
    expect(prismaMock.stockAdjustment.create).not.toHaveBeenCalled();
  });

  it('replays an idempotent reverse with the same key and payload', async () => {
    const payloadHash = buildInventoryReversalPayloadHash({
      originalAdjustmentId: ORIGINAL,
      storeId: STORE,
      productId: PRODUCT,
      unitId: UNIT,
      qtyBase: 2,
      direction: 'INCREASE',
      normalizedReason: 'Posted to the wrong product',
      schemaVersion: INVENTORY_REVERSAL_SCHEMA_VERSION,
    });
    prismaMock.stockAdjustment.findUnique.mockResolvedValueOnce(
      createdReversal({ payloadHash }),
    );
    const result = await reverseInventoryAdjustment(baseInput());
    expect(result.replayed).toBe(true);
    expect(result.id).toBe('adj-rev-1');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(incrementInventoryBalanceQtyOnlyMock).not.toHaveBeenCalled();
  });

  it('cannot reverse a reversal', async () => {
    prismaMock.stockAdjustment.findFirst.mockResolvedValue({
      ...originalDecrease(),
      reversalOfId: 'adj-even-older',
    });
    await expect(reverseInventoryAdjustment(baseInput())).rejects.toMatchObject({
      code: INVENTORY_REVERSAL_ERROR.CANNOT_REVERSE_REVERSAL,
    });
  });

  it('rejects non-owner actors', async () => {
    await expect(reverseInventoryAdjustment(baseInput({ userRole: 'MANAGER' }))).rejects.toMatchObject({
      code: INVENTORY_REVERSAL_ERROR.UNAUTHORISED,
    });
  });

  it('requires a reason', async () => {
    await expect(reverseInventoryAdjustment(baseInput({ reason: 'ab' }))).rejects.toMatchObject({
      code: INVENTORY_REVERSAL_ERROR.INVALID_ADJUSTMENT,
    });
  });
});
