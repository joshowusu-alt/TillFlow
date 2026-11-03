/** Real services and persisted records; permitted only by the guarded disposable PG harness. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import { INVENTORY_VALUE_V1 } from '@/lib/inventory-value';
import { purchaseDocumentFixture } from '@/lib/test/purchase-document-fixture';

// Framework cache/request plumbing and asynchronous fraud notifications are outside this financial test.
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/headers', () => ({ headers: () => new Headers() }));
vi.mock('@/lib/action-utils', () => ({ UserError: class UserError extends Error {} }));
vi.mock('@/lib/services/risk-monitor', () => ({
  detectVoidFrequencyRisk: vi.fn().mockResolvedValue(undefined),
  detectExcessiveDiscountRisk: vi.fn().mockResolvedValue(undefined),
  detectNegativeMarginRisk: vi.fn().mockResolvedValue(undefined),
  detectCashVarianceRisk: vi.fn().mockResolvedValue(undefined),
}));

const describePg = canRunLivePostgresTests() ? describe : describe.skip;
describePg('commercial audit: persisted trading day and terminal invoices', () => {
  let prisma: PrismaClient;
  let sales: typeof import('./sales');
  let purchases: typeof import('./purchases');
  let payments: typeof import('./payments');
  let returns: typeof import('./returns');
  let shifts: typeof import('./shifts');
  let expenses: typeof import('./expenses');
  let momo: typeof import('./momo-confirmation');
  let accounting: typeof import('@/lib/accounting');
  const businessIds: string[] = [];
  const unitIds: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await openTestPrismaClient());
    [sales, purchases, payments, returns, shifts, expenses, momo, accounting] = await Promise.all([
      import('./sales'), import('./purchases'), import('./payments'), import('./returns'),
      import('./shifts'), import('./expenses'), import('./momo-confirmation'), import('@/lib/accounting'),
    ]);
  }, 60000);

  afterAll(async () => {
    if (!prisma || !businessIds.length) return;
    const businessId = { in: businessIds };
    const store = { businessId };
    await runTestTeardown(prisma, [
      () => prisma.auditLog.deleteMany({ where: { businessId } }),
      () => prisma.journalEntry.deleteMany({ where: { businessId } }),
      () => prisma.cashVarianceInvestigation.deleteMany({ where: { businessId } }),
      () => prisma.salesReturn.deleteMany({ where: { store } }),
      () => prisma.purchaseReturn.deleteMany({ where: { store } }),
      () => prisma.mobileMoneyStatusLog.deleteMany({ where: { collection: { businessId } } }),
      () => prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId } } }),
      () => prisma.mobileMoneyCollection.deleteMany({ where: { businessId } }),
      () => prisma.salesInvoice.deleteMany({ where: { businessId } }),
      () => prisma.purchasePayment.deleteMany({ where: { businessId } }),
      () => prisma.purchaseDocument.deleteMany({ where: { purchaseInvoice: { businessId } } }),
      () => prisma.purchaseInvoice.deleteMany({ where: { businessId } }),
      () => prisma.expense.deleteMany({ where: { businessId } }),
      () => prisma.cashDrawerEntry.deleteMany({ where: { businessId } }),
      () => prisma.moneyIdempotency.deleteMany({ where: { businessId } }),
      () => prisma.stockMovement.deleteMany({ where: { store } }),
      () => prisma.inventoryBalance.deleteMany({ where: { store } }),
      () => prisma.product.deleteMany({ where: { businessId } }),
      () => prisma.unit.deleteMany({ where: { id: { in: unitIds } } }),
      () => prisma.customer.deleteMany({ where: { businessId } }),
      () => prisma.supplier.deleteMany({ where: { businessId } }),
      () => prisma.businessSequence.deleteMany({ where: { businessId } }),
      () => prisma.account.deleteMany({ where: { businessId } }),
      () => prisma.shift.deleteMany({ where: { till: { store } } }),
      () => prisma.till.deleteMany({ where: { store } }),
      () => prisma.store.deleteMany({ where: { businessId } }),
      () => prisma.user.deleteMany({ where: { businessId } }),
      () => prisma.business.deleteMany({ where: { id: businessId } }),
    ], { label: 'commercial-audit.pg.test.ts' });
  }, 60000);

  async function fixture() {
    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const business = await prisma.business.create({ data: {
      name: `Disposable commercial audit ${nonce}`, currency: 'GHS', vatEnabled: false, storeMode: 'MULTI_STORE',
    } });
    businessIds.push(business.id);
    const owner = await prisma.user.create({ data: { businessId: business.id, email: `owner-${nonce}@example.invalid`, name: 'Audit owner', role: 'OWNER', passwordHash: 'fixture-only' } });
    const cashier = await prisma.user.create({ data: { businessId: business.id, email: `cashier-${nonce}@example.invalid`, name: 'Audit cashier', role: 'CASHIER', passwordHash: 'fixture-only' } });
    const product = await prisma.product.create({ data: { businessId: business.id, name: `Audit product ${nonce}`, sellingPriceBasePence: 5000, defaultCostBasePence: 1000 } });
    const unit = await prisma.unit.create({ data: { name: `Audit piece ${nonce}`, pluralName: 'Audit pieces' } });
    unitIds.push(unit.id);
    await prisma.productUnit.create({ data: { productId: product.id, unitId: unit.id, isBaseUnit: true, conversionToBase: 1 } });
    const customer = await prisma.customer.create({ data: { businessId: business.id, name: 'Disposable debtor' } });
    const supplier = await prisma.supplier.create({ data: { businessId: business.id, name: 'Disposable supplier' } });
    const stores = [];
    for (let index = 0; index < 2; index++) {
      const store = await prisma.store.create({ data: { businessId: business.id, name: `Store ${index}` } });
      const till = await prisma.till.create({ data: { storeId: store.id, name: `Till ${index}` } });
      await prisma.inventoryBalance.create({ data: { storeId: store.id, productId: product.id, qtyOnHandBase: 100, avgCostBasePence: 1000, knownValuePence: 100000, unvaluedQtyBase: 0 } });
      await prisma.stockMovement.create({ data: { storeId: store.id, productId: product.id, qtyBase: 100, unitCostBasePence: 1000, valuePence: 100000, costBasis: INVENTORY_VALUE_V1, type: 'OPENING', userId: owner.id } });
      stores.push({ storeId: store.id, tillId: till.id });
    }
    await accounting.ensureChartOfAccounts(business.id, prisma);
    // Opening assets are fixture evidence; shift opening must not recognise new income.
    await accounting.postJournalEntry({ businessId: business.id, description: 'Fixture opening assets', prismaClient: prisma,
      lines: [{ accountCode: '1000', debitPence: 40000 }, { accountCode: '1200', debitPence: 200000 }, { accountCode: '3000', creditPence: 240000 }] });
    return { businessId: business.id, owner, cashier, productId: product.id, unitId: unit.id, customerId: customer.id, supplierId: supplier.id, stores };
  }

  async function ledger(businessId: string) {
    const entries = await prisma.journalEntry.findMany({ where: { businessId }, include: { lines: { include: { account: true } } } });
    const balances: Record<string, number> = {};
    for (const entry of entries) {
      expect(entry.lines.reduce((sum, line) => sum + line.debitPence - line.creditPence, 0), entry.id).toBe(0);
      for (const line of entry.lines) balances[line.account.code] = (balances[line.account.code] ?? 0) + line.debitPence - line.creditPence;
    }
    return balances;
  }

  it('reconciles GH200+500+100-120-30-50=600 on two stores/tills with different cashiers', async () => {
    const f = await fixture();
    const { businessId, owner, productId, unitId, customerId, supplierId } = f;
    for (const [index, context] of f.stores.entries()) {
      const { storeId, tillId } = context;
      const cashier = index === 0 ? owner : f.cashier;
      const actor = { userId: cashier.id, userName: cashier.name, userRole: cashier.role };
      const other = f.stores[1 - index];
      const otherBefore = await prisma.cashDrawerEntry.count({ where: { tillId: other.tillId } });
      const beforeLedger = await ledger(businessId);
      const opened = await shifts.performShiftOpen({ businessId, storeId, tillId, actor, openingCashPence: 20000 });
      const base = { businessId, storeId, tillId, cashierUserId: cashier.id, capturedShiftId: opened.id };
      const sale = (price: number, method?: 'CASH' | 'MOBILE_MONEY') => sales.createSale({ ...base,
        customerId: method ? undefined : customerId, paymentStatus: method ? 'PAID' : 'UNPAID',
        externalRef: `OFFLINE_SYNC:commercial-${opened.id}-${price}`,
        lines: [{ productId, unitId, qtyInUnit: 1, unitPricePence: price }],
        payments: method ? [{ method, amountPence: price }] : [],
      });
      const cash = await sale(45000, 'CASH');
      const refundSale = await sale(5000, 'CASH');
      const momoSale = await sale(30000, 'MOBILE_MONEY');
      const credit = await sale(15000);
      expect((await sale(45000, 'CASH')).id).toBe(cash.id);
      expect(await prisma.stockMovement.count({ where: { referenceType: 'SALES_INVOICE', referenceId: cash.id } })).toBe(1);
      expect(await prisma.salesPayment.count({ where: { salesInvoiceId: cash.id } })).toBe(1);
      const momoPayment = await prisma.salesPayment.findFirstOrThrow({ where: { salesInvoiceId: momoSale.id } });
      expect(momoPayment.status).toBe('PENDING_MANUAL');
      await momo.confirmMomoPayment({ paymentId: momoPayment.id, reference: 'DISPOSABLE-STMT', note: 'Isolated audited statement',
        actor: { userId: owner.id, userName: owner.name, userRole: 'OWNER', businessId }, authorisedStoreIds: [storeId] });
      const receiptKey = `commercial-receipt-${opened.id}`;
      for (let retry = 0; retry < 2; retry++) await payments.recordCustomerPayment(businessId, credit.id,
        [{ method: 'CASH', amountPence: 10000 }], cashier.id, { idempotencyKey: receiptKey });
      expect(await prisma.salesPayment.count({ where: { salesInvoiceId: credit.id } })).toBe(1);
      const purchase = await purchases.createPurchase({ sourceDocuments: [purchaseDocumentFixture()], businessId, storeId, supplierId, userId: owner.id,
        paymentStatus: 'UNPAID', payments: [], lines: [{ productId, unitId, qtyInUnit: 1, unitCostPence: 12000 }], acknowledgeHighCost: true,
        idempotencyKey: `commercial-purchase-${opened.id}` });
      const supplierOptions = { recordedByUserId: owner.id, actorRole: 'OWNER', actorName: owner.name,
        tillId, shiftId: opened.id, idempotencyKey: `commercial-supplier-${opened.id}` };
      for (let retry = 0; retry < 2; retry++) await payments.recordSupplierPayment(businessId, purchase.id,
        [{ method: 'CASH', amountPence: 12000 }], supplierOptions);
      expect(await prisma.purchasePayment.count({ where: { purchaseInvoiceId: purchase.id } })).toBe(1);
      expect((await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: purchase.id } })).paymentStatus).toBe('PAID');
      const account = await prisma.account.findUniqueOrThrow({ where: { businessId_code: { businessId, code: '6000' } } });
      await expenses.createExpense({ businessId, storeId, userId: owner.id, accountId: account.id, amountPence: 3000,
        paymentStatus: 'PAID', method: 'CASH', amountPaidPence: 3000, tillId, shiftId: opened.id, idempotencyKey: `commercial-expense-${opened.id}` });
      await returns.createSalesReturn({ businessId, salesInvoiceId: refundSale.id, userId: cashier.id, managerApprovedByUserId: owner.id,
        reasonCode: 'WRONG_ITEM', type: 'RETURN', refundMethod: 'CASH', refundAmountPence: 5000 });
      const drawer = await prisma.cashDrawerEntry.findMany({ where: { shiftId: opened.id } });
      const totals = drawer.reduce((acc, row) => { acc[row.entryType] = (acc[row.entryType] ?? 0) + row.amountPence; return acc; }, {} as Record<string, number>);
      expect(totals).toMatchObject({ OPEN_FLOAT: 20000, CASH_SALE: 50000, CASH_DEBTOR_PAYMENT: 10000,
        PAID_OUT_SUPPLIER: -12000, PAID_OUT_EXPENSE: -3000, CASH_REFUND: -5000 });
      expect(drawer.reduce((sum, row) => sum + row.amountPence, 0)).toBe(60000);
      expect((await prisma.shift.findUniqueOrThrow({ where: { id: opened.id } })).expectedCashPence).toBe(60000);
      await shifts.performShiftClose({ businessId, actor: { userId: owner.id, userName: owner.name, userRole: 'OWNER' },
        shiftId: opened.id, actualCash: 60000, notes: 'Isolated commercial audit', varianceReasonCode: null, varianceReason: null,
        approval: { mode: 'PIN', approvingManagerId: owner.id } });
      const closed = await prisma.shift.findUniqueOrThrow({ where: { id: opened.id } });
      expect(closed).toMatchObject({ status: 'CLOSED', expectedCashPence: 60000, actualCashPence: 60000, variance: 0, momoTotalPence: 30000 });
      expect(await prisma.cashDrawerEntry.count({ where: { tillId: other.tillId } })).toBe(otherBefore);
      const balance = await prisma.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId } } });
      const movements = await prisma.stockMovement.findMany({ where: { storeId, productId } });
      expect(balance.qtyOnHandBase).toBe(98);
      expect(balance.knownValuePence).toBe(109000);
      expect(movements.reduce((sum, row) => sum + row.qtyBase, 0)).toBe(balance.qtyOnHandBase);
      expect(movements.reduce((sum, row) => sum + (row.valuePence ?? 0), 0)).toBe(balance.knownValuePence);
      const afterLedger = await ledger(businessId);
      const delta = (code: string) => (afterLedger[code] ?? 0) - (beforeLedger[code] ?? 0);
      expect(delta('1000')).toBe(40000); // Opening cash already existed in the fixture GL.
      expect(delta('1010')).toBe(30000);
      expect(delta('1100')).toBe(5000);
      expect(delta('2000')).toBe(0);
      expect(delta('4000')).toBe(-90000);
      expect(delta('5000')).toBe(3000);
      expect(delta('6000')).toBe(3000);
      expect(delta('1200')).toBe(9000);
    }
  }, 120000);

  it('returned/voided unpaid invoices reject later money without persisted side effects', async () => {
    const f = await fixture();
    const { businessId, owner, productId, unitId, supplierId, customerId } = f;
    const { storeId, tillId } = f.stores[0];
    await shifts.performShiftOpen({ businessId, storeId, tillId, openingCashPence: 0, actor: { userId: owner.id, userName: owner.name, userRole: 'OWNER' } });
    for (const type of ['RETURN', 'VOID'] as const) {
      const sale = await sales.createSale({ businessId, storeId, tillId, cashierUserId: owner.id, customerId,
        paymentStatus: 'UNPAID', payments: [], lines: [{ productId, unitId, qtyInUnit: 1 }] });
      await returns.createSalesReturn({ businessId, salesInvoiceId: sale.id, userId: owner.id, managerApprovedByUserId: owner.id, reasonCode: 'WRONG_ITEM', type });
      const purchase = await purchases.createPurchase({ sourceDocuments: [purchaseDocumentFixture()], businessId, storeId, supplierId, userId: owner.id,
        paymentStatus: 'UNPAID', payments: [], lines: [{ productId, unitId, qtyInUnit: 1, unitCostPence: 1000 }] });
      await returns.createPurchaseReturn({ businessId, purchaseInvoiceId: purchase.id, userId: owner.id, type });
      const before = await ledger(businessId);
      const journals = await prisma.journalEntry.count({ where: { businessId } });
      const drawer = await prisma.cashDrawerEntry.count({ where: { businessId } });
      await expect(payments.recordCustomerPayment(businessId, sale.id, [{ method: 'CARD', amountPence: 1000 }], owner.id,
        { idempotencyKey: `closed-customer-${sale.id}` })).rejects.toThrow('returned or voided invoice');
      await expect(payments.recordSupplierPayment(businessId, purchase.id, [{ method: 'CARD', amountPence: 1000 }],
        { recordedByUserId: owner.id, actorRole: 'OWNER', idempotencyKey: `closed-supplier-${purchase.id}` })).rejects.toThrow('returned or voided invoice');
      expect(await prisma.salesPayment.count({ where: { salesInvoiceId: sale.id } })).toBe(0);
      expect(await prisma.purchasePayment.count({ where: { purchaseInvoiceId: purchase.id } })).toBe(0);
      expect(await prisma.journalEntry.count({ where: { businessId } })).toBe(journals);
      expect(await prisma.cashDrawerEntry.count({ where: { businessId } })).toBe(drawer);
      expect(await ledger(businessId)).toEqual(before);
      const status = type === 'RETURN' ? 'RETURNED' : 'VOID';
      expect((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: sale.id } })).paymentStatus).toBe(status);
      expect((await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: purchase.id } })).paymentStatus).toBe(status);
    }
  }, 90000);
});
