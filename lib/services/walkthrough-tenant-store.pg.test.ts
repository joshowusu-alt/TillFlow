import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  bindPrismaPostgresUrls,
  canRunLivePostgres,
  openBoundPrismaClient,
  resolveBoundPostgresUrl,
} from '@/lib/test/isolated-postgres';
import { runTestTeardown } from '@/lib/test/test-prisma';
import { createPurchase } from '@/lib/services/purchases';
import { createExpense } from '@/lib/services/expenses';
import { createInventoryIncrease } from '@/lib/services/inventory-increase';
import { reverseInventoryAdjustment } from '@/lib/services/inventory-reversal';
import { performShiftOpen, TILL_ALREADY_OPEN_MSG } from '@/lib/services/shifts';
import { recordCustomerPayment } from '@/lib/services/payments';

const auth = {
  user: { id: '', name: 'Owner', role: 'OWNER' },
  businessId: '',
  storeId: '',
};

vi.mock('@/lib/action-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/action-utils')>('@/lib/action-utils');
  return {
    ...actual,
    requireSelectedStoreContext: async () => ({
      user: auth.user,
      businessId: auth.businessId,
      storeId: auth.storeId,
    }),
  };
});

vi.mock('@/lib/cache/pos-tags', () => ({
  revalidatePosCatalog: () => undefined,
}));

vi.mock('@/lib/improve-records-revalidate', () => ({
  revalidateImproveRecordsHome: () => undefined,
}));

vi.mock('@/app/actions/stock-alerts', () => ({
  checkAndSendLowStockAlert: async () => undefined,
}));

const databaseUrl = resolveBoundPostgresUrl();
const canRun = canRunLivePostgres(databaseUrl);
if (canRun) {
  bindPrismaPostgresUrls(databaseUrl);
  process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE = '1';
  process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1 = '1';
  process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_ROLLOUT_MODE = 'ALLOWLIST';
}
const describeLive = canRun ? describe : describe.skip;

describeLive('cross-business and selected-store isolation (Postgres)', () => {
  let prisma: PrismaClient;
  const suffix = `tenant-${Date.now()}`;
  let bizA = '';
  let bizB = '';
  let storeFirst = '';
  let storeSelected = '';
  let foreignStore = '';
  let userA = '';
  let productId = '';
  let unitId = '';
  let supplierId = '';
  let expenseAccountId = '';

  beforeAll(async () => {
    bindPrismaPostgresUrls(databaseUrl);
    prisma = await openBoundPrismaClient(databaseUrl);
    const business = await prisma.business.create({
      data: {
        name: `Tenant ${suffix}`,
        currency: 'GHS',
        plan: 'GROWTH',
        mode: 'ADVANCED',
        storeMode: 'MULTI_STORE',
        accounts: {
          create: [
            { code: '1000', name: 'Cash', type: 'ASSET' },
            { code: '1010', name: 'Bank', type: 'ASSET' },
            { code: '1100', name: 'Accounts Receivable', type: 'ASSET' },
            { code: '1200', name: 'Inventory', type: 'ASSET' },
            { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
            { code: '4100', name: 'Inventory Gain & Surplus', type: 'INCOME' },
            { code: '5100', name: 'Inventory Loss & Shrinkage', type: 'EXPENSE' },
            { code: '6000', name: 'Operating', type: 'EXPENSE' },
          ],
        },
      },
    });
    bizA = business.id;
    process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_BUSINESS_IDS = business.id;
    const first = await prisma.store.create({ data: { businessId: bizA, name: `A First ${suffix}` } });
    const selected = await prisma.store.create({ data: { businessId: bizA, name: `B Selected ${suffix}` } });
    storeFirst = first.id;
    storeSelected = selected.id;
    const ordered = await prisma.store.findMany({
      where: { businessId: bizA },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    expect(ordered[0].id).toBe(storeFirst);
    const foreign = await prisma.business.create({
      data: { name: `Foreign ${suffix}`, currency: 'GHS' },
    });
    bizB = foreign.id;
    const foreignStoreRow = await prisma.store.create({
      data: { businessId: bizB, name: `Foreign store ${suffix}` },
    });
    foreignStore = foreignStoreRow.id;
    const user = await prisma.user.create({
      data: {
        businessId: bizA,
        email: `${suffix}@example.com`,
        name: 'Owner',
        role: 'OWNER',
        passwordHash: 'x',
      },
    });
    userA = user.id;
    auth.user = { id: user.id, name: 'Owner', role: 'OWNER' };
    auth.businessId = business.id;
    auth.storeId = storeSelected;
    const unit = await prisma.unit.create({
      data: { name: `u-${suffix}`, pluralName: 'us', symbol: 'u' },
    });
    unitId = unit.id;
    const product = await prisma.product.create({
      data: {
        businessId: bizA,
        name: `P ${suffix}`,
        active: true,
        sellingPriceBasePence: 200,
        defaultCostBasePence: 100,
        productUnits: { create: { unitId, conversionToBase: 1, isBaseUnit: true } },
      },
    });
    productId = product.id;
    await prisma.inventoryBalance.create({
      data: { storeId: storeSelected, productId, qtyOnHandBase: 4, avgCostBasePence: 100 },
    });
    await prisma.inventoryBalance.create({
      data: { storeId: storeFirst, productId, qtyOnHandBase: 40, avgCostBasePence: 100 },
    });
    const supplier = await prisma.supplier.create({
      data: { businessId: bizA, name: `Supplier ${suffix}` },
    });
    supplierId = supplier.id;
    const expenseAccount = await prisma.account.findFirstOrThrow({
      where: { businessId: bizA, code: '6000' },
    });
    expenseAccountId = expenseAccount.id;
  }, 90000);

  afterAll(async () => {
    await runTestTeardown(
      prisma,
      [
        // The suite also creates a till on the foreign (bizB) store; scope every store-level delete
        // to BOTH tenants, otherwise `store`/`business` deletes fail on Till_storeId_fkey.
        () => prisma.cashDrawerEntry.deleteMany({ where: { businessId: { in: [bizA, bizB] } } }),
        () => prisma.auditLog.deleteMany({ where: { businessId: { in: [bizA, bizB] } } }),
        () => prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId: bizA } } }),
        () => prisma.salesInvoice.deleteMany({ where: { businessId: { in: [bizA, bizB] } } }),
        () => prisma.stocktakeLine.deleteMany({ where: { stocktake: { store: { businessId: bizA } } } }),
        () => prisma.stocktake.deleteMany({ where: { store: { businessId: { in: [bizA, bizB] } } } }),
        () => prisma.shift.deleteMany({ where: { till: { store: { businessId: { in: [bizA, bizB] } } } } }),
        () => prisma.purchasePayment.deleteMany({ where: { businessId: bizA } }),
        () => prisma.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoice: { businessId: bizA } } }),
        () => prisma.purchaseInvoice.deleteMany({ where: { businessId: bizA } }),
        () => prisma.expensePayment.deleteMany({ where: { expense: { businessId: bizA } } }),
        () => prisma.expense.deleteMany({ where: { businessId: bizA } }),
        () => prisma.stockMovement.deleteMany({ where: { storeId: { in: [storeFirst, storeSelected] } } }),
        () => prisma.stockAdjustment.deleteMany({ where: { storeId: { in: [storeFirst, storeSelected] } } }),
        () => prisma.journalLine.deleteMany({ where: { journalEntry: { businessId: bizA } } }),
        () => prisma.journalEntry.deleteMany({ where: { businessId: bizA } }),
        () => prisma.inventoryBalance.deleteMany({ where: { storeId: { in: [storeFirst, storeSelected] } } }),
        () => prisma.productUnit.deleteMany({ where: { productId } }),
        () => prisma.product.deleteMany({ where: { id: productId } }),
        () => prisma.supplier.deleteMany({ where: { id: supplierId } }),
        () => prisma.till.deleteMany({ where: { store: { businessId: { in: [bizA, bizB] } } } }),
        () => prisma.user.deleteMany({ where: { businessId: { in: [bizA, bizB] } } }),
        () => prisma.store.deleteMany({ where: { businessId: { in: [bizA, bizB] } } }),
        () => prisma.account.deleteMany({ where: { businessId: { in: [bizA, bizB] } } }),
        () => prisma.business.deleteMany({ where: { id: { in: [bizA, bizB] } } }),
      ],
      { label: 'walkthrough-tenant-store.pg.test.ts' },
    );
  });

  it('rejects foreign business store, stocktake, adjustment and shift', async () => {
    bindPrismaPostgresUrls(databaseUrl);
    await expect(
      createPurchase({
        businessId: bizA,
        storeId: foreignStore,
        supplierId,
        paymentStatus: 'UNPAID',
        payments: [],
        lines: [{ productId, unitId, qtyInUnit: 1, unitCostPence: 100 }],
        userId: userA,
        skipCashDrawerRequirement: true,
      }),
    ).rejects.toThrow();

    const foreignStocktake = await prisma.stocktake.create({
      data: { storeId: foreignStore, userId: userA, status: 'IN_PROGRESS' },
    });
    const found = await prisma.stocktake.findFirst({
      where: {
        id: foreignStocktake.id,
        storeId: storeSelected,
        store: { businessId: bizA },
      },
    });
    expect(found).toBeNull();
    expect(readFileSync(join(process.cwd(), 'app/actions/stocktake.ts'), 'utf8')).toContain(
      'store: { businessId }',
    );

    await expect(
      createInventoryIncrease({
        businessId: bizA,
        storeId: foreignStore,
        productId,
        unitId,
        qtyInUnit: 1,
        reasonCode: 'STOCK_FOUND',
        reason: 'Foreign store must fail',
        idempotencyKey: `${suffix}-foreign-adj`,
        userId: userA,
        userName: 'Owner',
        userRole: 'OWNER',
      }),
    ).rejects.toThrow();

    const foreignTill = await prisma.till.create({
      data: { storeId: foreignStore, name: `Foreign till ${suffix}`, active: true },
    });
    await expect(
      performShiftOpen({
        businessId: bizA,
        storeId: storeSelected,
        tillId: foreignTill.id,
        openingCashPence: 100,
        actor: { userId: userA, userName: 'Owner', userRole: 'OWNER' },
      }),
    ).rejects.toThrow('Till not found for your business.');

    const foreignUser = await prisma.user.create({
      data: {
        businessId: bizB,
        email: `${suffix}-foreign@example.com`,
        name: 'Foreign',
        role: 'OWNER',
        passwordHash: 'x',
      },
    });
    const foreignInvoice = await prisma.salesInvoice.create({
      data: {
        businessId: bizB,
        storeId: foreignStore,
        tillId: foreignTill.id,
        cashierUserId: foreignUser.id,
        paymentStatus: 'UNPAID',
        subtotalPence: 1000,
        vatPence: 0,
        totalPence: 1000,
      },
    });
    await expect(
      recordCustomerPayment(
        bizA,
        foreignInvoice.id,
        [{ method: 'TRANSFER', amountPence: 1000 }],
        userA,
        { idempotencyKey: `${suffix}-foreign-rcpt` },
      ),
    ).rejects.toThrow(/Invoice not found/);
  });

  it('posts purchase, expense, stock and shift to selected store B while A is first', async () => {
    bindPrismaPostgresUrls(databaseUrl);
    const purchase = await createPurchase({
      businessId: bizA,
      storeId: storeSelected,
      supplierId,
      paymentStatus: 'UNPAID',
      payments: [],
      lines: [{ productId, unitId, qtyInUnit: 2, unitCostPence: 100 }],
      userId: userA,
      skipCashDrawerRequirement: true,
      idempotencyKey: `${suffix}-pur-b`,
    });
    expect(purchase.storeId ?? storeSelected).toBeTruthy();
    const invoice = await prisma.purchaseInvoice.findFirstOrThrow({
      where: { businessId: bizA, storeId: storeSelected },
    });
    expect(invoice.storeId).toBe(storeSelected);
    expect(await prisma.purchaseInvoice.count({ where: { businessId: bizA, storeId: storeFirst } })).toBe(0);

    const expense = await createExpense({
      businessId: bizA,
      storeId: storeSelected,
      accountId: expenseAccountId,
      amountPence: 500,
      amountPaidPence: 0,
      paymentStatus: 'UNPAID',
      notes: 'Selected store B expense',
      userId: userA,
    });
    const expenseRow = await prisma.expense.findFirstOrThrow({ where: { id: (expense as { id: string }).id } });
    expect(expenseRow.storeId).toBe(storeSelected);

    const increase = await createInventoryIncrease({
      businessId: bizA,
      storeId: storeSelected,
      productId,
      unitId,
      qtyInUnit: 3,
      reasonCode: 'STOCK_FOUND',
      reason: 'Selected store B surplus',
      idempotencyKey: `${suffix}-adj-b`,
      userId: userA,
      userName: 'Owner',
      userRole: 'OWNER',
    });
    await reverseInventoryAdjustment({
      businessId: bizA,
      storeId: storeSelected,
      originalAdjustmentId: increase.id,
      reason: 'Reverse on store B',
      userId: userA,
      userName: 'Owner',
      userRole: 'OWNER',
    });

    const till = await prisma.till.create({
      data: { storeId: storeSelected, name: `Till B ${suffix}`, active: true },
    });
    const shift = await performShiftOpen({
      businessId: bizA,
      storeId: storeSelected,
      tillId: till.id,
      openingCashPence: 2500,
      actor: { userId: userA, userName: 'Owner', userRole: 'OWNER' },
    });
    expect(shift.storeId).toBe(storeSelected);
    await expect(
      performShiftOpen({
        businessId: bizA,
        storeId: storeSelected,
        tillId: till.id,
        openingCashPence: 1,
        actor: { userId: userA, userName: 'Owner', userRole: 'OWNER' },
      }),
    ).rejects.toThrow(TILL_ALREADY_OPEN_MSG);

    const tillA = await prisma.till.create({
      data: { storeId: storeSelected, name: `Receipt till ${suffix}`, active: true },
    });
    const invoiceB = await prisma.salesInvoice.create({
      data: {
        businessId: bizA,
        storeId: storeSelected,
        tillId: tillA.id,
        cashierUserId: userA,
        paymentStatus: 'UNPAID',
        subtotalPence: 1500,
        vatPence: 0,
        totalPence: 1500,
      },
    });
    await recordCustomerPayment(
      bizA,
      invoiceB.id,
      [{ method: 'TRANSFER', amountPence: 1500 }],
      userA,
      { idempotencyKey: `${suffix}-rcpt-b` },
    );
    expect(await prisma.salesPayment.count({ where: { salesInvoiceId: invoiceB.id } })).toBe(1);
    expect(await prisma.salesInvoice.count({ where: { businessId: bizA, storeId: storeFirst } })).toBe(0);

    const stocktake = await prisma.stocktake.create({
      data: {
        storeId: storeSelected,
        userId: userA,
        status: 'IN_PROGRESS',
        lines: {
          create: {
            productId,
            expectedBase: 4,
            countedBase: 2,
            varianceBase: -2,
            countState: 'COUNTED',
            countedAt: new Date(),
            countedByUserId: userA,
          },
        },
      },
      include: { lines: true },
    });
    const { completeStocktakeAction } = await import('@/app/actions/stocktake');
    const completed = await completeStocktakeAction({
      stocktakeId: stocktake.id,
      storeId: storeSelected,
      counts: [{ lineId: stocktake.lines[0].id, countedBase: 2 }],
      reason: 'Selected store B shortfall',
    });
    expect(completed, JSON.stringify(completed)).toMatchObject({ success: true });
    expect(await prisma.stocktake.count({ where: { storeId: storeFirst } })).toBe(0);

    expect(await prisma.stockMovement.count({ where: { storeId: storeFirst } })).toBe(0);
    expect(await prisma.stockAdjustment.count({ where: { storeId: storeFirst } })).toBe(0);
    expect(await prisma.shift.count({ where: { till: { storeId: storeFirst } } })).toBe(0);
    expect(await prisma.expense.count({ where: { businessId: bizA, storeId: storeFirst } })).toBe(0);
  });
});
