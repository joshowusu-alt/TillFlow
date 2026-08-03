import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_CODES } from '@/lib/accounting';
import {
  INVENTORY_DECREASE_ERROR,
  INVENTORY_DECREASE_SCHEMA_VERSION,
  buildInventoryDecreasePayloadHash,
  checkedMul,
  createInventoryDecrease,
  InventoryDecreaseError,
  normalizeReasonText,
} from './inventory-decrease';

const {
  prismaMock,
  postJournalEntryMock,
  ensureInventoryDecreaseAccountsMock,
  decrementInventoryBalanceMock,
  isPhase1EnabledMock,
  detectInventoryAdjustmentRiskMock,
} = vi.hoisted(() => ({
  prismaMock: {
    store: { findFirst: vi.fn() },
    productUnit: { findFirst: vi.fn() },
    business: { findUnique: vi.fn() },
    stockAdjustment: { findUnique: vi.fn(), create: vi.fn() },
    inventoryBalance: { findUnique: vi.fn() },
    stockMovement: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
  ensureInventoryDecreaseAccountsMock: vi.fn(),
  decrementInventoryBalanceMock: vi.fn(),
  isPhase1EnabledMock: vi.fn(() => true),
  detectInventoryAdjustmentRiskMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/inventory-decrease-flag', () => ({
  isInventoryDecreasePhase1Enabled: isPhase1EnabledMock,
}));
vi.mock('@/lib/accounting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/accounting')>('@/lib/accounting');
  return {
    ...actual,
    postJournalEntry: postJournalEntryMock,
  };
});
vi.mock('@/lib/accounting-inventory-decrease-accounts', () => ({
  ensureInventoryDecreaseAccounts: ensureInventoryDecreaseAccountsMock,
}));
vi.mock('@/lib/accounting-inventory-loss-5100', () => ({
  assertAccount5100SafeForInventoryLoss: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    decrementInventoryBalance: decrementInventoryBalanceMock,
  };
});
vi.mock('./risk-monitor', () => ({
  detectInventoryAdjustmentRisk: detectInventoryAdjustmentRiskMock,
}));
const BIZ = 'biz-1';
const STORE = 'store-1';
const PRODUCT = 'prod-1';
const UNIT = 'unit-1';

function baseInput(overrides: Partial<Parameters<typeof createInventoryDecrease>[0]> = {}) {
  return {
    businessId: BIZ,
    storeId: STORE,
    productId: PRODUCT,
    unitId: UNIT,
    qtyInUnit: 2,
    reasonCode: 'WASTAGE' as const,
    reason: 'Floor wastage',
    idempotencyKey: 'idem-1',
    userId: 'user-1',
    userName: 'Manager',
    userRole: 'MANAGER',
    ...overrides,
  };
}

function makeCreated(overrides: Record<string, unknown> = {}) {
  return {
    id: 'adj-1',
    storeId: STORE,
    productId: PRODUCT,
    unitId: UNIT,
    qtyInUnit: 2,
    qtyBase: -2,
    reasonCode: 'WASTAGE',
    reason: 'Floor wastage',
    idempotencyKey: 'idem-1',
    payloadHash: 'hash',
    unitCostBasePence: 100,
    valuePence: 200,
    schemaVersion: INVENTORY_DECREASE_SCHEMA_VERSION,
    ...overrides,
  };
}

describe('inventory decrease helpers', () => {
  it('normalizes reason text', () => {
    expect(normalizeReasonText('  Floor   wastage  ')).toBe('Floor wastage');
  });

  it('checkedMul rejects unsafe products', () => {
    expect(checkedMul(2, 3)).toBe(6);
    expect(() => checkedMul(Number.MAX_SAFE_INTEGER, 2)).toThrow(InventoryDecreaseError);
  });

  it('payloadHash changes when reason changes', () => {
    const a = buildInventoryDecreasePayloadHash({
      businessId: BIZ,
      storeId: STORE,
      productId: PRODUCT,
      unitId: UNIT,
      conversionToBase: 1,
      qtyBase: 2,
      reasonCode: 'WASTAGE',
      normalizedReason: 'Floor wastage',
      schemaVersion: 1,
    });
    const b = buildInventoryDecreasePayloadHash({
      businessId: BIZ,
      storeId: STORE,
      productId: PRODUCT,
      unitId: UNIT,
      conversionToBase: 1,
      qtyBase: 2,
      reasonCode: 'WASTAGE',
      normalizedReason: 'Different reason',
      schemaVersion: 1,
    });
    expect(a).not.toBe(b);
  });
});

describe('createInventoryDecrease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPhase1EnabledMock.mockReturnValue(true);
    process.env.DATABASE_URL = 'file:./dev.db';

    prismaMock.store.findFirst.mockResolvedValue({ id: STORE });
    prismaMock.productUnit.findFirst.mockResolvedValue({ conversionToBase: 1 });
    prismaMock.stockAdjustment.findUnique.mockResolvedValue(null);
    prismaMock.inventoryBalance.findUnique.mockResolvedValue({
      qtyOnHandBase: 10,
      avgCostBasePence: 100,
    });
    prismaMock.stockAdjustment.create.mockResolvedValue(makeCreated());
    prismaMock.stockMovement.create.mockResolvedValue({ id: 'mov-1' });
    prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    prismaMock.business.findUnique.mockResolvedValue({ inventoryAdjustmentRiskThresholdBase: 50 });
    decrementInventoryBalanceMock.mockResolvedValue(8);
    postJournalEntryMock.mockResolvedValue({ id: 'je-1' });
    ensureInventoryDecreaseAccountsMock.mockResolvedValue(
      new Map([
        [ACCOUNT_CODES.inventory, 'acc-1200'],
        [ACCOUNT_CODES.inventoryLoss, 'acc-5100'],
      ]),
    );

    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) =>
      fn(prismaMock),
    );
  });

  it('rejects when the Phase 1 flag is off', async () => {
    isPhase1EnabledMock.mockReturnValue(false);
    await expect(createInventoryDecrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.FLAG_DISABLED,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects missing userRole before any writes', async () => {
    await expect(
      createInventoryDecrease(baseInput({ userRole: '   ' })),
    ).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.INVALID_ADJUSTMENT,
      message: expect.stringMatching(/role/i),
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.stockAdjustment.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('posts a decrease with Dr 5100 / Cr 1200 and in-tx audit', async () => {
    const result = await createInventoryDecrease(baseInput({ reasonCode: 'EXPIRED' }));

    expect(result.replayed).toBe(false);
    expect(result.id).toBe('adj-1');
    expect(decrementInventoryBalanceMock).toHaveBeenCalledWith(prismaMock, STORE, PRODUCT, 2);
    expect(postJournalEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          { accountCode: ACCOUNT_CODES.inventoryLoss, debitPence: 200 },
          { accountCode: ACCOUNT_CODES.inventory, creditPence: 200 },
        ],
        accountMap: expect.any(Map),
      }),
    );
    expect(ensureInventoryDecreaseAccountsMock).toHaveBeenCalledWith(BIZ, prismaMock);
    expect(ACCOUNT_CODES.inventoryLoss).toBe('5100');
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'INVENTORY_ADJUST',
          entityId: 'adj-1',
        }),
      }),
    );
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          qtyBase: -2,
          beforeQtyBase: 10,
          afterQtyBase: 8,
          unitCostBasePence: 100,
        }),
      }),
    );
  });

  it('supports each Phase 1 reason code', async () => {
    for (const reasonCode of [
      'WASTAGE',
      'EXPIRED',
      'DAMAGED',
      'THEFT',
      'STOCKTAKE_SHORTFALL',
      'AUTHORISED_QUANTITY_CORRECTION',
    ] as const) {
      vi.clearAllMocks();
      isPhase1EnabledMock.mockReturnValue(true);
      prismaMock.store.findFirst.mockResolvedValue({ id: STORE });
      prismaMock.productUnit.findFirst.mockResolvedValue({ conversionToBase: 1 });
      prismaMock.stockAdjustment.findUnique.mockResolvedValue(null);
      prismaMock.inventoryBalance.findUnique.mockResolvedValue({
        qtyOnHandBase: 10,
        avgCostBasePence: 50,
      });
      prismaMock.stockAdjustment.create.mockResolvedValue(
        makeCreated({ reasonCode, unitCostBasePence: 50, valuePence: 100 }),
      );
      prismaMock.stockMovement.create.mockResolvedValue({});
      prismaMock.auditLog.create.mockResolvedValue({});
      decrementInventoryBalanceMock.mockResolvedValue(8);
      postJournalEntryMock.mockResolvedValue({});
      ensureInventoryDecreaseAccountsMock.mockResolvedValue(
        new Map([
          [ACCOUNT_CODES.inventory, 'acc-1200'],
          [ACCOUNT_CODES.inventoryLoss, 'acc-5100'],
        ]),
      );
      prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) =>
        fn(prismaMock),
      );

      const result = await createInventoryDecrease(
        baseInput({ reasonCode, idempotencyKey: `idem-${reasonCode}` }),
      );
      expect(result.reasonCode).toBe(reasonCode);
    }
  });

  it('rejects missing balance as INSUFFICIENT_QUANTITY', async () => {
    prismaMock.inventoryBalance.findUnique.mockResolvedValue(null);
    await expect(createInventoryDecrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.INSUFFICIENT_QUANTITY,
    });
  });

  it('rejects inadequate quantity', async () => {
    prismaMock.inventoryBalance.findUnique.mockResolvedValue({
      qtyOnHandBase: 1,
      avgCostBasePence: 100,
    });
    await expect(createInventoryDecrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.INSUFFICIENT_QUANTITY,
    });
    expect(ensureInventoryDecreaseAccountsMock).not.toHaveBeenCalled();
    expect(postJournalEntryMock).not.toHaveBeenCalled();
  });

  it('rejects zero avgCostBasePence as MISSING_VALUATION without writes', async () => {
    prismaMock.inventoryBalance.findUnique.mockResolvedValue({
      qtyOnHandBase: 10,
      avgCostBasePence: 0,
    });
    await expect(createInventoryDecrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.MISSING_VALUATION,
    });
    expect(prismaMock.stockAdjustment.create).not.toHaveBeenCalled();
    expect(ensureInventoryDecreaseAccountsMock).not.toHaveBeenCalled();
    expect(postJournalEntryMock).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not use Product.defaultCostBasePence', async () => {
    // productUnit lookup must not select default cost — only conversion.
    await createInventoryDecrease(baseInput());
    expect(prismaMock.productUnit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { conversionToBase: true },
      }),
    );
  });

  it('rejects invalid reason code and short reason', async () => {
    await expect(
      createInventoryDecrease(baseInput({ reasonCode: 'NOPE' as any })),
    ).rejects.toMatchObject({ code: INVENTORY_DECREASE_ERROR.INVALID_ADJUSTMENT });
    await expect(createInventoryDecrease(baseInput({ reason: 'ab' }))).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.INVALID_ADJUSTMENT,
    });
  });

  it('replays a matching idempotent request without a second write', async () => {
    const hash = buildInventoryDecreasePayloadHash({
      businessId: BIZ,
      storeId: STORE,
      productId: PRODUCT,
      unitId: UNIT,
      conversionToBase: 1,
      qtyBase: 2,
      reasonCode: 'WASTAGE',
      normalizedReason: 'Floor wastage',
      schemaVersion: INVENTORY_DECREASE_SCHEMA_VERSION,
    });
    prismaMock.stockAdjustment.findUnique.mockResolvedValue(makeCreated({ payloadHash: hash }));

    const result = await createInventoryDecrease(baseInput());
    expect(result.replayed).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns DUPLICATE_MISMATCH when idempotency key collides with different hash', async () => {
    prismaMock.stockAdjustment.findUnique.mockResolvedValue(
      makeCreated({ payloadHash: 'other-hash' }),
    );
    await expect(createInventoryDecrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.DUPLICATE_MISMATCH,
    });
  });

  it('recovers from a unique-constraint race outside the aborted transaction', async () => {
    const hash = buildInventoryDecreasePayloadHash({
      businessId: BIZ,
      storeId: STORE,
      productId: PRODUCT,
      unitId: UNIT,
      conversionToBase: 1,
      qtyBase: 2,
      reasonCode: 'WASTAGE',
      normalizedReason: 'Floor wastage',
      schemaVersion: INVENTORY_DECREASE_SCHEMA_VERSION,
    });

    prismaMock.$transaction.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['storeId', 'idempotencyKey'] },
    });
    prismaMock.stockAdjustment.findUnique
      .mockResolvedValueOnce(null) // preliminary
      .mockResolvedValueOnce(makeCreated({ payloadHash: hash })); // post-race reread

    const result = await createInventoryDecrease(baseInput());
    expect(result.replayed).toBe(true);
  });

  it('rolls back conceptually when journal posting fails', async () => {
    postJournalEntryMock.mockRejectedValueOnce(new Error('Unbalanced journal entry: 1 != 2'));
    await expect(createInventoryDecrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.POSTING_FAILURE,
    });
  });

  it('maps missing account codes to ACCOUNT_MAPPING_UNAVAILABLE', async () => {
    postJournalEntryMock.mockRejectedValueOnce(new Error('Account not found for code 5100'));
    await expect(createInventoryDecrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.ACCOUNT_MAPPING_UNAVAILABLE,
    });
  });

  it('maps incompatible account resolution to ACCOUNT_MAPPING_UNAVAILABLE without journal', async () => {
    ensureInventoryDecreaseAccountsMock.mockRejectedValueOnce(
      new Error(
        'Account 1200 is configured as "Merchandise" (ASSET) but inventory decrease requires "Inventory" (ASSET). Refusing to post to an incorrectly configured account.',
      ),
    );
    await expect(createInventoryDecrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.ACCOUNT_MAPPING_UNAVAILABLE,
    });
    expect(postJournalEntryMock).not.toHaveBeenCalled();
  });

  it('fails the transaction when audit insert fails', async () => {
    prismaMock.auditLog.create.mockRejectedValueOnce(new Error('audit down'));
    await expect(createInventoryDecrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.AUDIT_FAILURE,
    });
  });

  it('rejects cross-tenant store', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null);
    await expect(createInventoryDecrease(baseInput())).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.UNAUTHORISED,
    });
  });

  it('uses PostgreSQL FOR UPDATE when DATABASE_URL is postgres', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/tillflow';
    prismaMock.$queryRaw.mockResolvedValue([{ qtyOnHandBase: 10, avgCostBasePence: 100 }]);

    await createInventoryDecrease(baseInput());

    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(prismaMock.inventoryBalance.findUnique).not.toHaveBeenCalled();
  });
});
