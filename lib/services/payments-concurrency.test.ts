/**
 * Overlapping-transaction concurrency evidence for supplier-payment idempotency.
 *
 * Requires a real Postgres DATABASE_URL (or SUPPLIER_PAYMENT_CONCURRENCY_DATABASE_URL).
 * Without it these tests are skipped — sequential mocks are not labelled as concurrency.
 *
 * Run isolated so modules bind to Postgres:
 *   set DATABASE_URL and SUPPLIER_PAYMENT_CONCURRENCY_DATABASE_URL, then
 *   npx vitest run lib/services/payments-concurrency.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';

const databaseUrl =
  process.env.SUPPLIER_PAYMENT_CONCURRENCY_DATABASE_URL || process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);

const describeConcurrency = canRun ? describe : describe.skip;

describeConcurrency('supplier payment overlapping transactions (Postgres)', () => {
  let prisma: PrismaClient;
  let recordSupplierPayment: typeof import('@/lib/services/payments').recordSupplierPayment;
  let SUPPLIER_PAYMENT_ERROR: typeof import('@/lib/services/payments').SUPPLIER_PAYMENT_ERROR;
  const suffix = `sp-conc-${Date.now()}`;
  let businessId = '';
  let storeId = '';
  let invoiceId = '';
  let userId = '';
  let supplierId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    // Drop any prior SQLite-bound singleton so the service uses Postgres.
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();
    const payments = await import('@/lib/services/payments');
    recordSupplierPayment = payments.recordSupplierPayment;
    SUPPLIER_PAYMENT_ERROR = payments.SUPPLIER_PAYMENT_ERROR;

    prisma = new PrismaClient();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: {
        name: `SP Conc ${suffix}`,
        currency: 'GHS',
        accounts: {
          create: [
            { code: '1000', name: 'Cash', type: 'ASSET' },
            { code: '1010', name: 'Bank', type: 'ASSET' },
            { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
          ],
        },
      },
    });
    businessId = business.id;

    const store = await prisma.store.create({
      data: { businessId, name: `Store ${suffix}` },
    });
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

    const till = await prisma.till.create({
      data: { storeId, name: `Till ${suffix}` },
    });

    // Opening float GH₵500 + cash sale GH₵1,000 + customer receipt GH₵200 = GH₵1,700 before supplier out.
    await prisma.shift.create({
      data: {
        tillId: till.id,
        userId,
        status: 'OPEN',
        openingCashPence: 50000,
        expectedCashPence: 170000,
      },
    });

    const supplier = await prisma.supplier.create({
      data: { businessId, name: `Supplier ${suffix}` },
    });
    supplierId = supplier.id;

    const invoice = await prisma.purchaseInvoice.create({
      data: {
        businessId,
        storeId,
        supplierId: supplier.id,
        totalPence: 60000,
        subtotalPence: 60000,
        vatPence: 0,
        paymentStatus: 'UNPAID',
      },
    });
    invoiceId = invoice.id;
  }, 90000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.auditLog.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.journalLine.deleteMany({ where: { journalEntry: { businessId } } }).catch(() => {});
    await prisma.journalEntry.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.cashDrawerEntry.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.purchasePayment.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.purchaseInvoice.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.shift.deleteMany({ where: { till: { storeId } } }).catch(() => {});
    await prisma.till.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.supplier.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.account.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.store.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: businessId } }).catch(() => {});
    await prisma.$disconnect();
  }, 90000);

  it('posts exactly once under concurrent identical idempotency keys (GH₵1,400)', async () => {
    const key = `conc-key-${suffix}`;
    const opts = {
      recordedByUserId: userId,
      actorRole: 'OWNER',
      actorName: 'Owner',
      idempotencyKey: key,
    } as const;

    const [a, b] = await Promise.all([
      recordSupplierPayment(businessId, invoiceId, [{ method: 'CASH', amountPence: 30000 }], opts),
      recordSupplierPayment(businessId, invoiceId, [{ method: 'CASH', amountPence: 30000 }], opts),
    ]);

    expect(a.invoice.id).toBe(invoiceId);
    expect(b.invoice.id).toBe(invoiceId);
    expect([a.replayed, b.replayed].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect([a.replayed, b.replayed].some((v) => v === false)).toBe(true);

    const payments = await prisma.purchasePayment.findMany({
      where: { businessId, purchaseInvoiceId: invoiceId },
    });
    expect(payments).toHaveLength(1);

    const drawers = await prisma.cashDrawerEntry.findMany({
      where: {
        businessId,
        entryType: 'PAID_OUT_SUPPLIER',
        referenceType: 'PURCHASE_PAYMENT',
        referenceId: payments[0]!.id,
      },
    });
    expect(drawers).toHaveLength(1);
    expect(drawers[0]!.amountPence).toBe(-30000);

    const journals = await prisma.journalEntry.findMany({
      where: { businessId, referenceType: 'SUPPLIER_PAYMENT', referenceId: invoiceId },
    });
    expect(journals).toHaveLength(1);

    const audits = await prisma.auditLog.findMany({
      where: { businessId, action: 'SUPPLIER_PAYMENT', entityId: payments[0]!.id },
    });
    expect(audits).toHaveLength(1);

    const shift = await prisma.shift.findFirst({
      where: { userId, status: 'OPEN' },
    });
    expect(shift?.expectedCashPence).toBe(140000);

    const paid = payments.reduce((s, p) => s + p.amountPence, 0);
    expect(60000 - paid).toBe(30000);
  }, 60000);

  it('rejects concurrent same-key requests with different payloads without a second post', async () => {
    const invoice = await prisma.purchaseInvoice.create({
      data: {
        businessId,
        storeId,
        supplierId,
        totalPence: 80000,
        subtotalPence: 80000,
        vatPence: 0,
        paymentStatus: 'UNPAID',
      },
    });
    const key = `conflict-key-${suffix}`;
    const baseOpts = {
      recordedByUserId: userId,
      actorRole: 'OWNER',
      actorName: 'Owner',
      idempotencyKey: key,
    } as const;

    const results = await Promise.allSettled([
      recordSupplierPayment(businessId, invoice.id, [{ method: 'TRANSFER', amountPence: 10000 }], baseOpts),
      recordSupplierPayment(businessId, invoice.id, [{ method: 'TRANSFER', amountPence: 20000 }], baseOpts),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof recordSupplierPayment>>
    >[];
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err?.code).toBe(SUPPLIER_PAYMENT_ERROR.IDEMPOTENCY_CONFLICT);

    const payments = await prisma.purchasePayment.findMany({
      where: { purchaseInvoiceId: invoice.id },
    });
    expect(payments).toHaveLength(1);
    // Either concurrent payload may win; the other must conflict with no second post.
    expect([10000, 20000]).toContain(payments[0]!.amountPence);
    expect(fulfilled[0]!.value.replayed).toBe(false);

    const journals = await prisma.journalEntry.findMany({
      where: { businessId, referenceType: 'SUPPLIER_PAYMENT', referenceId: invoice.id },
    });
    expect(journals).toHaveLength(1);

    const drawers = await prisma.cashDrawerEntry.findMany({
      where: {
        businessId,
        entryType: 'PAID_OUT_SUPPLIER',
        referenceId: { in: payments.map((p) => p.id) },
      },
    });
    expect(drawers).toHaveLength(0);
  }, 60000);

  it('allows two concurrent intentional payments with distinct keys', async () => {
    const invoice2 = await prisma.purchaseInvoice.create({
      data: {
        businessId,
        storeId,
        supplierId,
        totalPence: 100000,
        subtotalPence: 100000,
        vatPence: 0,
        paymentStatus: 'UNPAID',
      },
    });

    const [a, b] = await Promise.all([
      recordSupplierPayment(
        businessId,
        invoice2.id,
        [{ method: 'TRANSFER', amountPence: 10000 }],
        {
          recordedByUserId: userId,
          actorRole: 'OWNER',
          actorName: 'Owner',
          idempotencyKey: `distinct-a-${suffix}`,
        },
      ),
      recordSupplierPayment(
        businessId,
        invoice2.id,
        [{ method: 'TRANSFER', amountPence: 10000 }],
        {
          recordedByUserId: userId,
          actorRole: 'OWNER',
          actorName: 'Owner',
          idempotencyKey: `distinct-b-${suffix}`,
        },
      ),
    ]);

    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(false);

    const payments = await prisma.purchasePayment.findMany({
      where: { purchaseInvoiceId: invoice2.id },
    });
    expect(payments).toHaveLength(2);

    const drawers = await prisma.cashDrawerEntry.findMany({
      where: {
        businessId,
        entryType: 'PAID_OUT_SUPPLIER',
        referenceId: { in: payments.map((p) => p.id) },
      },
    });
    expect(drawers).toHaveLength(0);
  }, 60000);

  it('isolates the same idempotency key across tenants', async () => {
    const other = await prisma.business.create({
      data: {
        name: `SP Other ${suffix}`,
        currency: 'GHS',
        accounts: {
          create: [
            { code: '1000', name: 'Cash', type: 'ASSET' },
            { code: '1010', name: 'Bank', type: 'ASSET' },
            { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
          ],
        },
      },
    });
    const otherStore = await prisma.store.create({
      data: { businessId: other.id, name: `Other store ${suffix}` },
    });
    const otherUser = await prisma.user.create({
      data: {
        businessId: other.id,
        email: `other-${suffix}@example.com`,
        name: 'Other Owner',
        role: 'OWNER',
        passwordHash: 'x',
      },
    });
    const otherSupplier = await prisma.supplier.create({
      data: { businessId: other.id, name: `Other supplier ${suffix}` },
    });
    const otherInvoice = await prisma.purchaseInvoice.create({
      data: {
        businessId: other.id,
        storeId: otherStore.id,
        supplierId: otherSupplier.id,
        totalPence: 50000,
        subtotalPence: 50000,
        vatPence: 0,
        paymentStatus: 'UNPAID',
      },
    });

    const sharedKey = `shared-key-${suffix}`;
    const homeInvoice = await prisma.purchaseInvoice.create({
      data: {
        businessId,
        storeId,
        supplierId,
        totalPence: 50000,
        subtotalPence: 50000,
        vatPence: 0,
        paymentStatus: 'UNPAID',
      },
    });

    await recordSupplierPayment(
      businessId,
      homeInvoice.id,
      [{ method: 'MOBILE_MONEY', amountPence: 5000 }],
      {
        recordedByUserId: userId,
        actorRole: 'OWNER',
        actorName: 'Owner',
        idempotencyKey: sharedKey,
      },
    );

    await recordSupplierPayment(
      other.id,
      otherInvoice.id,
      [{ method: 'MOBILE_MONEY', amountPence: 5000 }],
      {
        recordedByUserId: otherUser.id,
        actorRole: 'OWNER',
        actorName: 'Other Owner',
        idempotencyKey: sharedKey,
      },
    );

    expect(await prisma.purchasePayment.count({ where: { businessId, idempotencyKey: sharedKey } })).toBe(1);
    expect(
      await prisma.purchasePayment.count({ where: { businessId: other.id, idempotencyKey: sharedKey } }),
    ).toBe(1);

    await prisma.purchasePayment.deleteMany({ where: { businessId: other.id } });
    await prisma.journalLine.deleteMany({ where: { journalEntry: { businessId: other.id } } });
    await prisma.journalEntry.deleteMany({ where: { businessId: other.id } });
    await prisma.auditLog.deleteMany({ where: { businessId: other.id } });
    await prisma.purchaseInvoice.deleteMany({ where: { businessId: other.id } });
    await prisma.supplier.deleteMany({ where: { businessId: other.id } });
    await prisma.user.deleteMany({ where: { businessId: other.id } });
    await prisma.account.deleteMany({ where: { businessId: other.id } });
    await prisma.store.deleteMany({ where: { businessId: other.id } });
    await prisma.business.deleteMany({ where: { id: other.id } });
  }, 60000);

  it('bank and MoMo retries do not touch drawer cash', async () => {
    const beforeExpected = (
      await prisma.shift.findFirstOrThrow({ where: { userId, status: 'OPEN' } })
    ).expectedCashPence;

    const bankInvoice = await prisma.purchaseInvoice.create({
      data: {
        businessId,
        storeId,
        supplierId,
        totalPence: 40000,
        subtotalPence: 40000,
        vatPence: 0,
        paymentStatus: 'UNPAID',
      },
    });
    const momoInvoice = await prisma.purchaseInvoice.create({
      data: {
        businessId,
        storeId,
        supplierId,
        totalPence: 40000,
        subtotalPence: 40000,
        vatPence: 0,
        paymentStatus: 'UNPAID',
      },
    });

    const bankKey = `bank-${suffix}`;
    const momoKey = `momo-${suffix}`;
    await Promise.all([
      recordSupplierPayment(
        businessId,
        bankInvoice.id,
        [{ method: 'TRANSFER', amountPence: 15000 }],
        { recordedByUserId: userId, actorRole: 'OWNER', actorName: 'Owner', idempotencyKey: bankKey },
      ),
      recordSupplierPayment(
        businessId,
        momoInvoice.id,
        [{ method: 'MOBILE_MONEY', amountPence: 15000 }],
        { recordedByUserId: userId, actorRole: 'OWNER', actorName: 'Owner', idempotencyKey: momoKey },
      ),
    ]);
    await Promise.all([
      recordSupplierPayment(
        businessId,
        bankInvoice.id,
        [{ method: 'TRANSFER', amountPence: 15000 }],
        { recordedByUserId: userId, actorRole: 'OWNER', actorName: 'Owner', idempotencyKey: bankKey },
      ),
      recordSupplierPayment(
        businessId,
        momoInvoice.id,
        [{ method: 'MOBILE_MONEY', amountPence: 15000 }],
        { recordedByUserId: userId, actorRole: 'OWNER', actorName: 'Owner', idempotencyKey: momoKey },
      ),
    ]);

    expect(await prisma.purchasePayment.count({ where: { purchaseInvoiceId: bankInvoice.id } })).toBe(1);
    expect(await prisma.purchasePayment.count({ where: { purchaseInvoiceId: momoInvoice.id } })).toBe(1);
    expect(
      await prisma.cashDrawerEntry.count({
        where: {
          businessId,
          entryType: 'PAID_OUT_SUPPLIER',
          referenceId: {
            in: (
              await prisma.purchasePayment.findMany({
                where: { purchaseInvoiceId: { in: [bankInvoice.id, momoInvoice.id] } },
                select: { id: true },
              })
            ).map((p) => p.id),
          },
        },
      }),
    ).toBe(0);

    const afterExpected = (
      await prisma.shift.findFirstOrThrow({ where: { userId, status: 'OPEN' } })
    ).expectedCashPence;
    expect(afterExpected).toBe(beforeExpected);
  }, 60000);
});

describe('supplier payment concurrency suite availability', () => {
  it('reports when overlapping Postgres tests are skipped', () => {
    if (!canRun) {
      expect(canRun).toBe(false);
    } else {
      expect(canRun).toBe(true);
    }
  });
});
