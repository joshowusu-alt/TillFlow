import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';

vi.mock('@/lib/action-utils', () => ({ UserError: class UserError extends Error {} }));
vi.mock('./risk-monitor', () => ({ detectVoidFrequencyRisk: vi.fn().mockResolvedValue(undefined), detectExcessiveDiscountRisk: vi.fn().mockResolvedValue(undefined), detectNegativeMarginRisk: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
const describePg = canRunLivePostgresTests() ? describe : describe.skip;

describePg('isolated inventory valuation and COGS evidence', () => {
  let db: PrismaClient;
  let businessId: string, storeId: string, userId: string, supplierId: string, customerId: string, tillId: string, unitId: string;
  let purchases: typeof import('./purchases');
  let sales: typeof import('./sales');
  let returns: typeof import('./returns');
  let opening: typeof import('./opening-inventory');
  let transfers: typeof import('./stock-transfers');
  let singleton: PrismaClient;
  const extraUnitIds: string[] = [];
  beforeAll(async () => {
    ({ prisma: db } = await openTestPrismaClient());
    purchases = await import('./purchases'); sales = await import('./sales');
    returns = await import('./returns'); opening = await import('./opening-inventory');
    transfers = await import('./stock-transfers');
    ({ prisma: singleton } = await import('@/lib/prisma'));
    businessId = (await db.business.create({ data: { name: `Valuation audit ${Date.now()}`, currency: 'GHS' } })).id;
    storeId = (await db.store.create({ data: { businessId, name: 'Disposable valuation branch' } })).id;
    userId = (await db.user.create({ data: { businessId, name: 'Owner', email: `valuation-${Date.now()}@example.invalid`, role: 'OWNER', passwordHash: 'fixture' } })).id;
    supplierId = (await db.supplier.create({ data: { businessId, name: 'Fixture supplier' } })).id;
    customerId = (await db.customer.create({ data: { businessId, name: 'Fixture customer' } })).id;
    tillId = (await db.till.create({ data: { storeId, name: 'Fixture till' } })).id;
    await db.shift.create({ data: { tillId, userId, status: 'OPEN', openKey: tillId } });
    unitId = (await db.unit.create({ data: { name: `Valuation piece ${Date.now()}`, pluralName: 'Pieces' } })).id;
    const { ensureChartOfAccounts } = await import('@/lib/accounting');
    await ensureChartOfAccounts(businessId, db);
  }, 90000);
  afterAll(async () => {
    vi.restoreAllMocks();
    if (!db || !businessId) return;
    await runTestTeardown(db, [
      () => db.auditLog.deleteMany({ where: { businessId } }),
      () => db.salesReturn.deleteMany({ where: { salesInvoice: { businessId } } }),
      () => db.purchaseReturn.deleteMany({ where: { purchaseInvoice: { businessId } } }),
      () => db.stockTransfer.deleteMany({ where: { businessId } }),
      () => db.salesInvoice.deleteMany({ where: { businessId } }),
      () => db.purchaseInvoice.deleteMany({ where: { businessId } }),
      () => db.cashDrawerEntry.deleteMany({ where: { businessId } }),
      () => db.moneyIdempotency.deleteMany({ where: { businessId } }),
      () => db.stockMovement.deleteMany({ where: { store: { businessId } } }),
      () => db.inventoryBalance.deleteMany({ where: { store: { businessId } } }),
      () => db.journalEntry.deleteMany({ where: { businessId } }),
      () => db.product.deleteMany({ where: { businessId } }),
      () => db.unit.deleteMany({ where: { id: { in: [unitId, ...extraUnitIds] } } }),
      () => db.customer.deleteMany({ where: { businessId } }),
      () => db.supplier.deleteMany({ where: { businessId } }),
      () => db.businessSequence.deleteMany({ where: { businessId } }),
      () => db.account.deleteMany({ where: { businessId } }),
      () => db.shift.deleteMany({ where: { tillId } }),
      () => db.till.deleteMany({ where: { storeId } }),
      () => db.store.deleteMany({ where: { businessId } }),
      () => db.user.deleteMany({ where: { businessId } }),
      () => db.business.delete({ where: { id: businessId } }),
    ]);
  }, 90000);
  async function product() {
    const p = await db.product.create({ data: { businessId, name: `SKU ${Date.now()}`, sellingPriceBasePence: 5000, defaultCostBasePence: 0,
      productUnits: { create: { unitId, isBaseUnit: true, conversionToBase: 1 } } } });
    return p.id;
  }
  const buy = (productId: string, qty: number, cost: number, extra = {}) => purchases.createPurchase({
    businessId, storeId, supplierId, userId, paymentStatus: 'UNPAID', payments: [],
    lines: [{ productId, unitId, qtyInUnit: qty, unitCostPence: cost }], ...extra,
  });
  const sell = (productId: string, qty: number) => sales.createSale({
    businessId, storeId, tillId, cashierUserId: userId, customerId, paymentStatus: 'UNPAID', payments: [],
    lines: [{ productId, unitId, qtyInUnit: qty }],
  });
  const stock = (productId: string) => db.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId } } });
  async function inventoryPosting(referenceIds: string[]) {
    const rows = await db.journalLine.findMany({ where: { account: { businessId, code: '1200' }, journalEntry: { businessId, referenceId: { in: referenceIds } } } });
    return rows.reduce((sum, row) => sum + row.debitPence - row.creditPence, 0);
  }
  async function balanced(referenceIds: string[]) {
    const entries = await db.journalEntry.findMany({ where: { businessId, referenceId: { in: referenceIds } }, include: { lines: true } });
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) expect(entry.lines.reduce((s, l) => s + l.debitPence - l.creditPence, 0)).toBe(0);
  }
  it('reconciles weighted-average purchases and stored sale COGS', async () => {
    const p = await product(); const a = await buy(p, 10, 1000); const b = await buy(p, 10, 1400);
    expect(await stock(p)).toMatchObject({ qtyOnHandBase: 20, avgCostBasePence: 1200 });
    const sale = await sell(p, 2);
    expect((await db.salesInvoiceLine.findFirstOrThrow({ where: { salesInvoiceId: sale.id } })).lineCostPence).toBe(2400);
    const current = await stock(p);
    expect(current.qtyOnHandBase * current.avgCostBasePence).toBe(await inventoryPosting([a.id, b.id, sale.id]));
    await balanced([a.id, b.id, sale.id]);
  }, 60000);
  it('preserves stored costs on a sale when later purchase prices change', async () => {
    const p = await product(); await buy(p, 1, 1000); const sale = await sell(p, 1); await buy(p, 1, 2000);
    expect((await db.salesInvoiceLine.findFirstOrThrow({ where: { salesInvoiceId: sale.id } })).lineCostPence).toBe(1000);
  }, 60000);
  it('rejects overselling without a new invoice, stock movement or journal', async () => {
    const p = await product(); await buy(p, 1, 1000);
    const before = await db.salesInvoice.count({ where: { businessId } });
    await expect(sell(p, 2)).rejects.toThrow();
    expect(await db.salesInvoice.count({ where: { businessId } })).toBe(before);
    expect((await stock(p)).qtyOnHandBase).toBe(1);
  }, 60000);
  it('reconciles valued opening stock and does not double apply the same reference', async () => {
    const p = await product(); const referenceId = `opening-${p}`;
    const input = { businessId, storeId, userId, referenceId, lines: [{ productId: p, unitId, qtyInUnit: 10, unitCostBasePence: 1000 }] };
    await opening.recordOpeningInventory(input); await opening.recordOpeningInventory(input);
    expect(await stock(p)).toMatchObject({ qtyOnHandBase: 10, avgCostBasePence: 1000 });
    expect(await inventoryPosting([referenceId])).toBe(10000);
  }, 60000);
  it.each(['RETURN', 'VOID'] as const)('reconciles an unchanged-cost full sales %s', async type => {
    const p = await product(); const purchase = await buy(p, 2, 1000); const sale = await sell(p, 1);
    const reversed = await returns.createSalesReturn({ businessId, salesInvoiceId: sale.id, userId, managerApprovedByUserId: userId, type, reasonCode: 'WRONG_ITEM' });
    const current = await stock(p);
    expect(current.qtyOnHandBase).toBe(2);
    expect(current.qtyOnHandBase * current.avgCostBasePence).toBe(await inventoryPosting([purchase.id, sale.id, reversed.id]));
    await balanced([purchase.id, sale.id, reversed.id]);
  }, 60000);
  it('reconciles a weighted-average branch transfer without changing business inventory value', async () => {
    const p = await product(); const other = await db.store.create({ data: { businessId, name: `Destination ${p}` } });
    const a = await buy(p, 4, 1000); const b = await buy(p, 2, 2000, { storeId: other.id });
    const request = await transfers.requestStockTransfer({ businessId, requestedByUserId: userId, fromStoreId: storeId, toStoreId: other.id, lines: [{ productId: p, qtyBase: 2 }] });
    await transfers.approveAndCompleteStockTransfer({ businessId, transferId: request.id, approvedByUserId: userId });
    const source = await stock(p); const target = await db.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId: other.id, productId: p } } });
    expect(source).toMatchObject({ qtyOnHandBase: 2, avgCostBasePence: 1000 });
    expect(target).toMatchObject({ qtyOnHandBase: 4, avgCostBasePence: 1500 });
    expect(source.qtyOnHandBase * source.avgCostBasePence + target.qtyOnHandBase * target.avgCostBasePence).toBe(await inventoryPosting([a.id, b.id, request.id]));
  }, 60000);
  // The following cases intentionally characterize unresolved valuation gaps.
  // Passing here proves the discrepancy, not a reconciled/approved contract.
  it('audit evidence: returning an old sale after restocking leaves a valuation gap', async () => {
    const p = await product(); const a = await buy(p, 1, 1000); const sale = await sell(p, 1); const b = await buy(p, 1, 2000);
    const returned = await returns.createSalesReturn({ businessId, salesInvoiceId: sale.id, userId, managerApprovedByUserId: userId, type: 'RETURN', reasonCode: 'WRONG_ITEM' });
    const current = await stock(p); const ledger = await inventoryPosting([a.id, sale.id, b.id, returned.id]);
    expect(current.qtyOnHandBase).toBe(2);
    expect(ledger).toBe(3000);
    expect(current.qtyOnHandBase * current.avgCostBasePence - ledger).toBe(1000);
    await balanced([a.id, sale.id, b.id, returned.id]);
  }, 60000);
  it('audit evidence: rounded pack costs differ from the actual purchase value', async () => {
    const p = await product(); const pack = await db.unit.create({ data: { name: `Pack ${p}`, pluralName: 'Packs' } });
    extraUnitIds.push(pack.id);
    await db.productUnit.create({ data: { productId: p, unitId: pack.id, conversionToBase: 3 } });
      const purchase = await purchases.createPurchase({ businessId, storeId, supplierId, userId, paymentStatus: 'UNPAID', payments: [], lines: [{ productId: p, unitId: pack.id, qtyInUnit: 1, unitCostPence: 1000 }] });
      const current = await stock(p); const ledger = await inventoryPosting([purchase.id]);
      expect(ledger).toBe(1000);
      expect(current.qtyOnHandBase * current.avgCostBasePence - ledger).toBe(-1);
  }, 60000);
  it('audit evidence: adding quantity-only opening stock can overstate valued stock', async () => {
    const p = await product(); const a = await buy(p, 1, 1000); const referenceId = `qty-only-${p}`;
    const result = await opening.recordOpeningInventory({ businessId, storeId, referenceId, lines: [{ productId: p, unitId, qtyInUnit: 1 }] });
    expect(result.unvaluedUnits).toBe(1); expect(result.journalPosted).toBe(false);
    const current = await stock(p);
    expect(current.qtyOnHandBase * current.avgCostBasePence - await inventoryPosting([a.id, referenceId])).toBe(1000);
  }, 60000);
  it.each(['UNPAID', 'PAID'] as const)('rolls back a %s purchase when stock-movement creation fails', async paymentStatus => {
    const p = await product();
    const before = await db.purchaseInvoice.count({ where: { businessId } });
    const journalsBefore = await db.journalEntry.count({ where: { businessId } });
    const originalTransaction = singleton.$transaction.bind(singleton);
    const injected = vi.spyOn(singleton, '$transaction').mockImplementationOnce((async (callback: any, options: any) =>
      originalTransaction(async tx => {
        const movementFailure = vi.spyOn(tx.stockMovement, 'createMany').mockRejectedValueOnce(new Error('Injected stock-movement failure'));
        try { return await callback(tx); } finally { movementFailure.mockRestore(); }
      }, options)) as typeof singleton.$transaction);
    const key = `rollback-${p}`;
    const extra = paymentStatus === 'PAID' ? { paymentStatus, payments: [{ method: 'TRANSFER' as const, amountPence: 1000 }], idempotencyKey: key } : {};
    try { await expect(buy(p, 1, 1000, extra)).rejects.toThrow('Injected stock-movement failure'); } finally { injected.mockRestore(); }
    expect(await db.purchaseInvoice.count({ where: { businessId } })).toBe(before);
    expect(await db.journalEntry.count({ where: { businessId } })).toBe(journalsBefore);
    expect(await db.inventoryBalance.findUnique({ where: { storeId_productId: { storeId, productId: p } } })).toBeNull();
    expect(await db.moneyIdempotency.count({ where: { businessId, key } })).toBe(0);
    expect(await db.purchasePayment.count({ where: { businessId, purchaseInvoice: { lines: { some: { productId: p } } } } })).toBe(0);
  }, 60000);
  it('reconciles concurrent distinct credit purchases on the same product', async () => {
    const p = await product();
    const [a, b] = await Promise.all([buy(p, 10, 1000), buy(p, 10, 1400)]);
    const current = await stock(p);
    expect(current).toMatchObject({ qtyOnHandBase: 20, avgCostBasePence: 1200 });
    expect(current.qtyOnHandBase * current.avgCostBasePence).toBe(await inventoryPosting([a.id, b.id]));
  }, 60000);
});
