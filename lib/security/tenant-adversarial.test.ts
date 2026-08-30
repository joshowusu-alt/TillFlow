/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertSameBusinessActor } from '@/lib/migration/roles';
import { assertStoreBelongsToPackageBusiness } from '@/lib/migration/tenant-policy';
import { MigrationPolicyError } from '@/lib/migration/errors';

const { prismaMock, postJournalEntryMock, recordCashDrawerEntryTxMock } = vi.hoisted(() => ({
  prismaMock: {
    salesInvoice: { findFirst: vi.fn(), update: vi.fn() },
    purchaseInvoice: { findFirst: vi.fn(), update: vi.fn() },
    salesPayment: { createMany: vi.fn() },
    purchasePayment: { createMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    salesReturn: { findUnique: vi.fn(), create: vi.fn() },
    user: { findFirst: vi.fn() },
    shift: { findFirst: vi.fn(), updateMany: vi.fn() },
    stockMovement: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  postJournalEntryMock: vi.fn(),
  recordCashDrawerEntryTxMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('@/lib/action-utils', () => ({
  UserError: class UserError extends Error {
    readonly isUserError = true;
    constructor(message: string) {
      super(message);
      this.name = 'UserError';
    }
  },
}));
vi.mock('@/lib/accounting', () => ({
  ACCOUNT_CODES: { cash: '1000', bank: '1010', ar: '1100', ap: '2000' },
  postJournalEntry: postJournalEntryMock,
}));
vi.mock('@/lib/services/cash-drawer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/cash-drawer')>(
    '@/lib/services/cash-drawer',
  );
  return {
    ...actual,
    recordCashDrawerEntryTx: recordCashDrawerEntryTxMock,
  };
});
vi.mock('@/lib/services/shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/shared')>(
    '@/lib/services/shared',
  );
  return {
    ...actual,
    fetchInventoryMap: vi.fn(),
    upsertInventoryBalance: vi.fn(),
  };
});
vi.mock('@/lib/services/risk-monitor', () => ({
  detectVoidFrequencyRisk: vi.fn(),
  detectCashVarianceRisk: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));

import { recordCustomerPayment, recordSupplierPayment, SUPPLIER_PAYMENT_ERROR } from '@/lib/services/payments';
import { createSalesReturn } from '@/lib/services/returns';
import { performShiftClose } from '@/lib/services/shifts';
import { getOpenShiftForTill } from '@/lib/services/cash-drawer';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const ACTOR_BIZ = 'biz-a';
const FOREIGN_TILL = 'till-biz-b';
const FOREIGN_STORE = 'store-biz-b';
const FOREIGN_INVOICE = 'inv-biz-b';
const FOREIGN_SHIFT = 'shift-biz-b';

describe('tenant guard functions', () => {
  it('rejects another business as the migration actor', () => {
    expect(() =>
      assertSameBusinessActor({ actorBusinessId: ACTOR_BIZ, packageBusinessId: 'biz-b' }),
    ).toThrow(MigrationPolicyError);
    expect(() =>
      assertSameBusinessActor({ actorBusinessId: ACTOR_BIZ, packageBusinessId: 'biz-b' }),
    ).toThrow(/Cross-tenant/);
  });

  it('rejects a store that belongs to another business', () => {
    expect(() =>
      assertStoreBelongsToPackageBusiness({
        packageBusinessId: ACTOR_BIZ,
        storeBusinessId: 'biz-b',
        sourceBranchKey: FOREIGN_STORE,
      }),
    ).toThrow(/outside this business/);
  });
});

describe('service tenant query contracts', () => {
  it('scopes store, till, invoice, and shift lookups to the caller business', () => {
    const sales = read('lib/services/sales.ts');
    expect(sales).toContain('where: { id: storeId, businessId }');
    expect(sales).toContain('where: { id: input.tillId, storeId: input.storeId, active: true }');
    expect(sales).toContain('getOpenShiftForTill(input.businessId, input.tillId)');

    const payments = read('lib/services/payments.ts');
    expect(payments).toContain('where: { id: invoiceId, businessId }');
    expect(payments).toContain('where: { id: invoiceId, businessId }');

    const returnsSrc = read('lib/services/returns.ts');
    expect(returnsSrc).toContain('where: { id: input.salesInvoiceId, businessId: input.businessId }');

    const shifts = read('lib/services/shifts.ts');
    expect(shifts).toContain('till: { store: { businessId } }');

    const drawer = read('lib/services/cash-drawer.ts');
    expect(drawer).toContain('store: { businessId }');
    expect(drawer).toContain('store: { businessId: input.businessId }');
  });
});

describe('adversarial till / store / invoice ids', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
    prismaMock.purchasePayment.findUnique.mockResolvedValue(null);
  });

  it('getOpenShiftForTill queries the caller business, so a foreign till cannot attach', async () => {
    prismaMock.shift.findFirst.mockResolvedValue(null);

    await expect(getOpenShiftForTill(ACTOR_BIZ, FOREIGN_TILL)).resolves.toBeNull();

    expect(prismaMock.shift.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tillId: FOREIGN_TILL,
          status: 'OPEN',
          till: { store: { businessId: ACTOR_BIZ } },
        }),
      }),
    );
  });

  it('recordCustomerPayment rejects another business invoice id with no writes', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue(null);

    await expect(
      recordCustomerPayment(ACTOR_BIZ, FOREIGN_INVOICE, [{ method: 'CASH', amountPence: 100 }]),
    ).rejects.toThrow('Invoice not found');

    expect(prismaMock.salesInvoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FOREIGN_INVOICE, businessId: ACTOR_BIZ },
      }),
    );
    expect(prismaMock.salesPayment.createMany).not.toHaveBeenCalled();
    expect(postJournalEntryMock).not.toHaveBeenCalled();
  });

  it('recordSupplierPayment rejects another business purchase invoice id with no writes', async () => {
    prismaMock.purchaseInvoice.findFirst.mockResolvedValue(null);

    await expect(
      recordSupplierPayment(
        ACTOR_BIZ,
        FOREIGN_INVOICE,
        [{ method: 'TRANSFER', amountPence: 100 }],
        {
          recordedByUserId: 'user-a',
          actorRole: 'OWNER',
          idempotencyKey: 'idem-foreign-invoice',
        },
      ),
    ).rejects.toMatchObject({
      code: SUPPLIER_PAYMENT_ERROR.NOT_FOUND,
      message: 'Invoice not found',
    });

    expect(prismaMock.purchaseInvoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FOREIGN_INVOICE, businessId: ACTOR_BIZ },
      }),
    );
    expect(prismaMock.purchasePayment.create).not.toHaveBeenCalled();
  });

  it('createSalesReturn rejects another business sale id with no writes', async () => {
    prismaMock.salesInvoice.findFirst.mockResolvedValue(null);

    await expect(
      createSalesReturn({
        businessId: ACTOR_BIZ,
        salesInvoiceId: FOREIGN_INVOICE,
        userId: 'user-a',
        type: 'RETURN',
        reasonCode: 'WRONG_ITEM',
        managerApprovedByUserId: 'mgr-a',
      }),
    ).rejects.toThrow('Sale not found');

    expect(prismaMock.salesInvoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FOREIGN_INVOICE, businessId: ACTOR_BIZ },
      }),
    );
    expect(prismaMock.salesReturn.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('performShiftClose rejects another business shift id with no writes', async () => {
    prismaMock.shift.findFirst.mockResolvedValue(null);

    await expect(
      performShiftClose({
        businessId: ACTOR_BIZ,
        actor: { userId: 'user-a', userName: 'Owner A', userRole: 'OWNER' },
        shiftId: FOREIGN_SHIFT,
        actualCash: 0,
        notes: null,
        varianceReasonCode: null,
        varianceReason: null,
        approval: { mode: 'PIN', approvingManagerId: 'user-a' },
      }),
    ).rejects.toThrow(/could not be found/);

    expect(prismaMock.shift.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: FOREIGN_SHIFT,
          till: { store: { businessId: ACTOR_BIZ } },
        },
      }),
    );
    expect(recordCashDrawerEntryTxMock).not.toHaveBeenCalled();
    expect(prismaMock.shift.updateMany).not.toHaveBeenCalled();
  });

  it('documents that createSale treats a foreign store or till as not found', () => {
    const sales = read('lib/services/sales.ts');
    expect(sales).toMatch(/if \(!store\) throw new Error\('Store not found'\)/);
    expect(sales).toMatch(/if \(!till\) throw new Error\('Till not found'\)/);
    expect(sales).toContain(`id: storeId, businessId`);
    expect(sales).toContain(`id: input.tillId, storeId: input.storeId`);
    void FOREIGN_STORE;
    void FOREIGN_TILL;
  });
});
