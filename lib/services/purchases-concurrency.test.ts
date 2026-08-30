/**
 * Overlapping-transaction concurrency evidence for paid createPurchase.
 *
 * Requires a real Postgres DATABASE_URL (or SUPPLIER_PAYMENT_CONCURRENCY_DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import { MONEY_IDEMPOTENCY_ERROR } from '@/lib/services/money-idempotency';

const databaseUrl =
  process.env.SUPPLIER_PAYMENT_CONCURRENCY_DATABASE_URL || process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);

const describeConcurrency = canRun ? describe : describe.skip;

describeConcurrency('paid createPurchase overlapping transactions (Postgres)', () => {
  let prisma: PrismaClient;
  let createPurchase: typeof import('@/lib/services/purchases').createPurchase;
  const suffix = `po-conc-${Date.now()}`;
  let businessId = '';
  let storeId = '';
  let userId = '';
  let tillId = '';
  let supplierId = '';
  let productId = '';
  let unitId = '';

  const line = () => [{ productId, unitId, qtyInUnit: 1, unitCostPence: 1000 }];

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();
    const purchases = await import('@/lib/services/purchases');
    createPurchase = purchases.createPurchase;

    prisma = new PrismaClient();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: {
        name: `PO Conc ${suffix}`,
        currency: 'GHS',
        accounts: {
          create: [
            { code: '1000', name: 'Cash', type: 'ASSET' },
            { code: '1010', name: 'Bank', type: 'ASSET' },
            { code: '1200', name: 'Inventory', type: 'ASSET' },
            { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
          ],
        },
      },
    });
    businessId = business.id;
    const store = await prisma.store.create({ data: { businessId, name: `Store ${suffix}` } });
    storeId = store.id;
    const user = await prisma.user.create({
      data: {
        businessId,
        email: `${suffix}@example.com`,
        name: 'Owner',
        role: 'OWNER',
        passwordHash: 'x',
      },
    });
    userId = user.id;
    const till = await prisma.till.create({ data: { storeId, name: `Till ${suffix}` } });
    tillId = till.id;
    await prisma.shift.create({
      data: {
        tillId: till.id,
        userId,
        status: 'OPEN',
        openKey: till.id,
        openingCashPence: 50000,
        expectedCashPence: 50000,
      },
    });
    const supplier = await prisma.supplier.create({
      data: { businessId, name: `Supplier ${suffix}` },
    });
    supplierId = supplier.id;
    const unit = await prisma.unit.create({
      data: { name: `Piece ${suffix}`, pluralName: 'Pieces', symbol: 'ea' },
    });
    unitId = unit.id;
    const product = await prisma.product.create({
      data: {
        businessId,
        name: `PO Conc SKU ${suffix}`,
        barcode: `PO${suffix}`.slice(0, 32),
        sellingPriceBasePence: 1500,
        defaultCostBasePence: 1000,
        productUnits: { create: { unitId, isBaseUnit: true, conversionToBase: 1 } },
      },
    });
    productId = product.id;
  }, 90000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.moneyIdempotency.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.cashDrawerEntry.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.stockMovement.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.purchasePayment.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoice: { businessId } } }).catch(() => {});
    await prisma.journalLine.deleteMany({ where: { journalEntry: { businessId } } }).catch(() => {});
    await prisma.journalEntry.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.purchaseInvoice.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.inventoryBalance.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.productUnit.deleteMany({ where: { productId } }).catch(() => {});
    await prisma.product.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.unit.deleteMany({ where: { id: unitId } }).catch(() => {});
    await prisma.shift.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.till.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.supplier.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.account.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.store.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('rejects paid createPurchase without a key before writing', async () => {
    await expect(
      createPurchase({
        businessId,
        storeId,
        supplierId,
        paymentStatus: 'PAID',
        payments: [{ method: 'CASH', amountPence: 1000 }],
        lines: line(),
        userId,
        tillId,
      }),
    ).rejects.toMatchObject({ code: MONEY_IDEMPOTENCY_ERROR.IDEMPOTENCY_REQUIRED });
    expect(await prisma.purchaseInvoice.count({ where: { businessId } })).toBe(0);
    expect(await prisma.moneyIdempotency.count({ where: { businessId } })).toBe(0);
  });

  it('creates credit-only unpaid purchases without a key and without a money row', async () => {
    const invoice = await createPurchase({
      businessId,
      storeId,
      supplierId,
      paymentStatus: 'UNPAID',
      payments: [],
      lines: line(),
      userId,
    });
    expect(invoice.paymentStatus).toBe('UNPAID');
    expect(await prisma.purchasePayment.count({ where: { purchaseInvoiceId: invoice.id } })).toBe(0);
    expect(await prisma.moneyIdempotency.count({ where: { businessId } })).toBe(0);
    const stock = await prisma.stockMovement.count({
      where: { storeId, referenceId: invoice.id },
    });
    expect(stock).toBeGreaterThan(0);
  });

  it('posts exactly once under concurrent identical paid keys', async () => {
    const key = `po-same-${suffix}`;
    const opts = {
      businessId,
      storeId,
      supplierId,
      paymentStatus: 'PAID' as const,
      payments: [{ method: 'CASH' as const, amountPence: 1000 }],
      lines: line(),
      userId,
      tillId,
      idempotencyKey: key,
    };
    const [a, b] = await Promise.allSettled([createPurchase(opts), createPurchase(opts)]);
    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof createPurchase>>
    >[];
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const invoiceId = fulfilled[0]!.value.id;
    fulfilled.forEach((row) => expect(row.value.id).toBe(invoiceId));
    expect(await prisma.purchaseInvoice.count({ where: { businessId, id: invoiceId } })).toBe(1);
    expect(await prisma.purchasePayment.count({ where: { purchaseInvoiceId: invoiceId } })).toBe(1);
    expect(await prisma.moneyIdempotency.count({ where: { businessId, key } })).toBe(1);
    expect(
      await prisma.journalEntry.count({
        where: { businessId, referenceType: 'PURCHASE_INVOICE', referenceId: invoiceId },
      }),
    ).toBe(1);
    expect(await prisma.stockMovement.count({ where: { storeId, referenceId: invoiceId } })).toBe(1);
  }, 60000);

  it('replays the same paid key and rejects a changed payload', async () => {
    const key = `po-replay-${suffix}`;
    const first = await createPurchase({
      businessId,
      storeId,
      supplierId,
      paymentStatus: 'PAID',
      payments: [{ method: 'TRANSFER', amountPence: 1000 }],
      lines: line(),
      userId,
      idempotencyKey: key,
    });
    const replay = await createPurchase({
      businessId,
      storeId,
      supplierId,
      paymentStatus: 'PAID',
      payments: [{ method: 'TRANSFER', amountPence: 1000 }],
      lines: line(),
      userId,
      idempotencyKey: key,
    });
    expect(replay.id).toBe(first.id);
    expect(await prisma.purchasePayment.count({ where: { purchaseInvoiceId: first.id } })).toBe(1);

    await expect(
      createPurchase({
        businessId,
        storeId,
        supplierId,
        paymentStatus: 'PAID',
        payments: [{ method: 'TRANSFER', amountPence: 500 }],
        lines: line(),
        userId,
        idempotencyKey: key,
      }),
    ).rejects.toMatchObject({ code: MONEY_IDEMPOTENCY_ERROR.IDEMPOTENCY_CONFLICT });
  }, 60000);

  it('does not reserve a money key when the paid transaction fails', async () => {
    const key = `po-fail-${suffix}`;
    const beforeInvoices = await prisma.purchaseInvoice.count({ where: { businessId } });
    await expect(
      createPurchase({
        businessId,
        storeId,
        supplierId,
        paymentStatus: 'PAID',
        payments: [{ method: 'CASH', amountPence: 1000 }],
        lines: line(),
        userId,
        tillId: 'missing-till',
        idempotencyKey: key,
      }),
    ).rejects.toThrow();
    expect(await prisma.moneyIdempotency.count({ where: { businessId, key } })).toBe(0);
    expect(await prisma.purchaseInvoice.count({ where: { businessId } })).toBe(beforeInvoices);
  });

  it('commits keyed unpaid purchases once including stock and the money row', async () => {
    const key = `po-unpaid-${suffix}`;
    const opts = {
      businessId,
      storeId,
      supplierId,
      paymentStatus: 'UNPAID' as const,
      payments: [] as { method: 'CASH'; amountPence: number }[],
      lines: line(),
      userId,
      idempotencyKey: key,
    };
    const [a, b] = await Promise.allSettled([createPurchase(opts), createPurchase(opts)]);
    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof createPurchase>>
    >[];
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const invoiceId = fulfilled[0]!.value.id;
    fulfilled.forEach((row) => expect(row.value.id).toBe(invoiceId));
    expect(await prisma.purchaseInvoice.count({ where: { businessId, id: invoiceId } })).toBe(1);
    expect(await prisma.purchasePayment.count({ where: { purchaseInvoiceId: invoiceId } })).toBe(0);
    expect(await prisma.moneyIdempotency.count({ where: { businessId, key } })).toBe(1);
    expect(await prisma.stockMovement.count({ where: { storeId, referenceId: invoiceId } })).toBe(1);
  }, 60000);
});
