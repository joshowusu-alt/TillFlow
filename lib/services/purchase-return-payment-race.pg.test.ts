/** Real PostgreSQL row-lock races; framework plumbing alone is mocked. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import { purchaseDocumentFixture } from '@/lib/test/purchase-document-fixture';
import { INVENTORY_VALUE_V1 } from '@/lib/inventory-value';

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/headers', () => ({ headers: () => new Headers() }));
vi.mock('@/lib/action-utils', () => ({ UserError: class UserError extends Error {} }));
vi.mock('@/lib/services/risk-monitor', () => ({ detectVoidFrequencyRisk: vi.fn().mockResolvedValue(undefined) }));

const describePg = canRunLivePostgresTests() ? describe : describe.skip;

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function within(promise: Promise<unknown>, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Race barrier not reached: ${label}`)), 2000);
    })]);
  } finally { clearTimeout(timer); }
}

describePg('purchase return versus supplier payment: persisted PostgreSQL barriers', () => {
  let prisma: PrismaClient;
  let appPrisma: PrismaClient;
  let payments: typeof import('./payments');
  let returns: typeof import('./returns');
  let purchases: typeof import('./purchases');
  let accounting: typeof import('@/lib/accounting');
  type Middleware = Parameters<PrismaClient['$use']>[0];
  let intercept: Middleware | undefined;
  const businesses: string[] = [];
  const units: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await openTestPrismaClient());
    ({ prisma: appPrisma } = await import('@/lib/prisma'));
    appPrisma.$use((params, next) => intercept ? intercept(params, next) : next(params));
    [payments, returns, purchases, accounting] = await Promise.all([
      import('./payments'), import('./returns'), import('./purchases'), import('@/lib/accounting'),
    ]);
  }, 60000);

  afterAll(async () => {
    intercept = undefined;
    if (!prisma) return;
    const businessId = { in: businesses };
    const store = { businessId };
    await runTestTeardown(prisma, [
      () => prisma.auditLog.deleteMany({ where: { businessId } }),
      () => prisma.journalEntry.deleteMany({ where: { businessId } }),
      () => prisma.cashDrawerEntry.deleteMany({ where: { businessId } }),
      () => prisma.purchaseReturn.deleteMany({ where: { store } }),
      () => prisma.purchaseDocument.deleteMany({ where: { purchaseInvoice: { businessId } } }),
      () => prisma.purchasePayment.deleteMany({ where: { businessId } }),
      () => prisma.purchaseInvoice.deleteMany({ where: { businessId } }),
      () => prisma.stockMovement.deleteMany({ where: { store } }),
      () => prisma.inventoryBalance.deleteMany({ where: { store } }),
      () => prisma.product.deleteMany({ where: { businessId } }),
      () => prisma.unit.deleteMany({ where: { id: { in: units } } }),
      () => prisma.shift.deleteMany({ where: { till: { store } } }),
      () => prisma.till.deleteMany({ where: { store } }),
      () => prisma.supplier.deleteMany({ where: { businessId } }),
      () => prisma.businessSequence.deleteMany({ where: { businessId } }),
      () => prisma.account.deleteMany({ where: { businessId } }),
      () => prisma.store.deleteMany({ where: { businessId } }),
      () => prisma.user.deleteMany({ where: { businessId } }),
      () => prisma.business.deleteMany({ where: { id: businessId } }),
    ], { label: 'purchase-return-payment-race' });
    await appPrisma.$disconnect();
  }, 60000);

  async function fixture() {
    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const business = await prisma.business.create({ data: { name: `Disposable return race ${nonce}`, currency: 'GHS' } });
    businesses.push(business.id);
    const owner = await prisma.user.create({ data: { businessId: business.id, email: `race-${nonce}@example.invalid`, name: 'Race owner', role: 'OWNER', passwordHash: 'fixture-only' } });
    const store = await prisma.store.create({ data: { businessId: business.id, name: 'Race store' } });
    const till = await prisma.till.create({ data: { storeId: store.id, name: 'Race till' } });
    const shift = await prisma.shift.create({ data: { tillId: till.id, userId: owner.id, status: 'OPEN', openKey: till.id, openingCashPence: 50000, expectedCashPence: 50000 } });
    const supplier = await prisma.supplier.create({ data: { businessId: business.id, name: 'Fictional supplier' } });
    const product = await prisma.product.create({ data: { businessId: business.id, name: 'Race product', sellingPriceBasePence: 20000, defaultCostBasePence: 10000 } });
    const unit = await prisma.unit.create({ data: { name: `race-piece-${nonce}`, pluralName: 'pieces' } });
    units.push(unit.id);
    await prisma.productUnit.create({ data: { productId: product.id, unitId: unit.id, conversionToBase: 1, isBaseUnit: true } });
    await prisma.inventoryBalance.create({ data: { storeId: store.id, productId: product.id, qtyOnHandBase: 10, avgCostBasePence: 10000, knownValuePence: 100000, unvaluedQtyBase: 0 } });
    await prisma.stockMovement.create({ data: { storeId: store.id, productId: product.id, userId: owner.id, qtyBase: 10, unitCostBasePence: 10000, valuePence: 100000, costBasis: INVENTORY_VALUE_V1, type: 'OPENING' } });
    await accounting.ensureChartOfAccounts(business.id, prisma);
    await accounting.postJournalEntry({ businessId: business.id, description: 'Opening fixture controls', prismaClient: prisma, lines: [
      { accountCode: '1000', debitPence: 50000 }, { accountCode: '1200', debitPence: 100000 }, { accountCode: '3000', creditPence: 150000 },
    ] });
    const invoice = await purchases.createPurchase({ businessId: business.id, storeId: store.id, supplierId: supplier.id, userId: owner.id,
      paymentStatus: 'UNPAID', payments: [], sourceDocuments: [purchaseDocumentFixture()],
      lines: [{ productId: product.id, unitId: unit.id, qtyInUnit: 1, unitCostPence: 10000 }], idempotencyKey: `purchase-${nonce}` });
    const pay = (key: string) => payments.recordSupplierPayment(business.id, invoice.id, [{ method: 'CASH', amountPence: 10000 }], {
      recordedByUserId: owner.id, actorRole: 'OWNER', actorName: owner.name, tillId: till.id, shiftId: shift.id, idempotencyKey: key,
    });
    const reverse = () => returns.createPurchaseReturn({ businessId: business.id, purchaseInvoiceId: invoice.id, userId: owner.id, type: 'RETURN', refundMethod: 'CASH', tillId: till.id, shiftId: shift.id });
    return { businessId: business.id, invoiceId: invoice.id, productId: product.id, storeId: store.id, shiftId: shift.id, pay, reverse };
  }

  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function snapshot(f: Fixture) {
    const [invoice, payment, returned, drawer, journal, stock, shift] = await Promise.all([
      prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: f.invoiceId } }),
      prisma.purchasePayment.findMany({ where: { purchaseInvoiceId: f.invoiceId } }),
      prisma.purchaseReturn.findMany({ where: { purchaseInvoiceId: f.invoiceId } }),
      prisma.cashDrawerEntry.findMany({ where: { businessId: f.businessId }, orderBy: { id: 'asc' } }),
      prisma.journalEntry.findMany({ where: { businessId: f.businessId }, include: { lines: { include: { account: true } } }, orderBy: { id: 'asc' } }),
      prisma.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId: f.storeId, productId: f.productId } } }),
      prisma.shift.findUniqueOrThrow({ where: { id: f.shiftId } }),
    ]);
    const balances: Record<string, number> = {};
    for (const entry of journal) {
      expect(entry.lines.reduce((sum, line) => sum + line.debitPence - line.creditPence, 0)).toBe(0);
      for (const line of entry.lines) balances[line.account.code] = (balances[line.account.code] ?? 0) + line.debitPence - line.creditPence;
    }
    return { invoice, payment, returned, drawer, journal, stock, shift, balances };
  }

  function holdAfter(model: 'PurchasePayment' | 'PurchaseReturn') {
    const held = signal();
    const release = signal();
    const competitorLock = signal();
    let armed = true;
    let holding = false;
    intercept = async (params, next) => {
      if (holding && params.action === 'queryRaw' && String(params.args?.query ?? '').includes('PurchaseInvoice')) competitorLock.resolve();
      const result = await next(params);
      if (armed && params.model === model && params.action === 'create') {
        armed = false; holding = true; held.resolve();
        await release.promise;
      }
      return result;
    };
    return { held, release, competitorLock };
  }

  it('payment commits first: waiting return reloads paid amount, reverses AP once and refunds exact cash', async () => {
    const f = await fixture();
    const barrier = holdAfter('PurchasePayment');
    const payment = f.pay(`payment-first-${f.invoiceId}`);
    let returned: ReturnType<Fixture['reverse']> | undefined;
    try {
      await within(barrier.held.promise, 'payment persisted under invoice lock');
      returned = f.reverse();
      await within(barrier.competitorLock.promise, 'return queued for invoice lock');
    } finally { barrier.release.resolve(); }
    await payment;
    await returned;
    intercept = undefined;
    const actual = await snapshot(f);
    expect(actual.invoice.paymentStatus).toBe('RETURNED');
    expect(actual.payment).toHaveLength(1);
    expect(actual.returned).toHaveLength(1);
    expect(actual.returned[0].refundAmountPence).toBe(10000);
    expect(actual.drawer.map(d => d.amountPence).sort((a, b) => a - b)).toEqual([-10000, 10000]);
    expect(actual.shift.expectedCashPence).toBe(50000);
    expect(actual.stock.qtyOnHandBase).toBe(10);
    expect(actual.stock.knownValuePence).toBe(100000);
    expect(actual.balances['2000']).toBe(0);
    expect(actual.balances['1000']).toBe(50000);
  }, 30000);

  it('return commits first: waiting supplier payment rejects with no cash or journal effect', async () => {
    const f = await fixture();
    const barrier = holdAfter('PurchaseReturn');
    const returned = f.reverse();
    let payment: ReturnType<Fixture['pay']> | undefined;
    try {
      await within(barrier.held.promise, 'return persisted under invoice lock');
      payment = f.pay(`return-first-${f.invoiceId}`);
      // Attach rejection handling immediately; it is asserted after releasing the lock.
      void payment.catch(() => {});
      await within(barrier.competitorLock.promise, 'payment queued for invoice lock');
    } finally { barrier.release.resolve(); }
    await returned;
    await expect(payment).rejects.toThrow('returned or voided invoice');
    intercept = undefined;
    const actual = await snapshot(f);
    expect(actual.payment).toHaveLength(0);
    expect(actual.returned).toHaveLength(1);
    expect(actual.returned[0].refundAmountPence).toBe(0);
    expect(actual.drawer).toHaveLength(0);
    expect(actual.journal.filter(j => j.referenceType === 'SUPPLIER_PAYMENT')).toHaveLength(0);
    expect(actual.shift.expectedCashPence).toBe(50000);
    expect(actual.stock.qtyOnHandBase).toBe(10);
    expect(actual.balances['2000']).toBe(0);
  }, 30000);

  it('two overlapping returns remove stock and reverse payable exactly once', async () => {
    const f = await fixture();
    const barrier = holdAfter('PurchaseReturn');
    const first = f.reverse();
    let second: ReturnType<Fixture['reverse']> | undefined;
    try {
      await within(barrier.held.promise, 'first return held');
      second = f.reverse(); void second.catch(() => {});
      await within(barrier.competitorLock.promise, 'second return queued');
    } finally { barrier.release.resolve(); }
    await first;
    await expect(second).rejects.toThrow('already returned or voided');
    intercept = undefined;
    const actual = await snapshot(f);
    expect(actual.returned).toHaveLength(1);
    expect(actual.journal.filter(j => j.referenceType === 'PURCHASE_RETURN')).toHaveLength(1);
    expect(await prisma.stockMovement.count({ where: { storeId: f.storeId, type: 'PURCHASE_RETURN' } })).toBe(1);
    expect(actual.stock.qtyOnHandBase).toBe(10);
    expect(actual.balances['2000']).toBe(0);
  }, 30000);

  it('late return journal failure rolls back return, stock, cash and status, then retry succeeds once', async () => {
    const f = await fixture();
    await f.pay(`before-failed-return-${f.invoiceId}`);
    const before = await snapshot(f);
    intercept = async (params, next) => {
      if (params.model === 'JournalEntry' && params.action === 'create' && params.args?.data?.referenceType === 'PURCHASE_RETURN') throw new Error('Injected return journal failure');
      return next(params);
    };
    await expect(f.reverse()).rejects.toThrow('Injected return journal failure');
    intercept = undefined;
    expect(await snapshot(f)).toEqual(before);
    await f.reverse();
    const actual = await snapshot(f);
    expect(actual.returned).toHaveLength(1);
    expect(actual.drawer).toHaveLength(2);
    expect(actual.stock.qtyOnHandBase).toBe(10);
    expect(actual.shift.expectedCashPence).toBe(50000);
  }, 30000);

  it('late supplier audit failure rolls back payment, drawer, journal and retry identity', async () => {
    const f = await fixture();
    const before = await snapshot(f);
    intercept = async (params, next) => {
      if (params.model === 'AuditLog' && params.action === 'create' && params.args?.data?.action === 'SUPPLIER_PAYMENT') throw new Error('Injected supplier audit failure');
      return next(params);
    };
    const key = `retry-after-rollback-${f.invoiceId}`;
    await expect(f.pay(key)).rejects.toThrow('Injected supplier audit failure');
    intercept = undefined;
    expect(await snapshot(f)).toEqual(before);
    await f.pay(key);
    await f.pay(key);
    const actual = await snapshot(f);
    expect(actual.payment).toHaveLength(1);
    expect(actual.drawer).toHaveLength(1);
    expect(actual.journal.filter(j => j.referenceType === 'SUPPLIER_PAYMENT')).toHaveLength(1);
    expect(actual.shift.expectedCashPence).toBe(40000);
    expect(actual.balances['2000']).toBe(0);
  }, 30000);
});
