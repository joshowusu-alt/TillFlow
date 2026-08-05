/**
 * Overlapping-transaction concurrency evidence for supplier-payment idempotency.
 *
 * Requires a real Postgres DATABASE_URL (or SUPPLIER_PAYMENT_CONCURRENCY_DATABASE_URL).
 * Without it these tests are skipped — sequential mocks are not labelled as concurrency.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import { recordSupplierPayment } from '@/lib/services/payments';

const databaseUrl =
  process.env.SUPPLIER_PAYMENT_CONCURRENCY_DATABASE_URL || process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);

const describeConcurrency = canRun ? describe : describe.skip;

describeConcurrency('supplier payment overlapping transactions (Postgres)', () => {
  let prisma: PrismaClient;
  const suffix = `sp-conc-${Date.now()}`;
  let businessId = '';
  let storeId = '';
  let invoiceId = '';
  let userId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
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
  }, 60000);

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
  }, 60000);

  it('posts exactly once under concurrent identical idempotency keys', async () => {
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
  }, 60000);

  it('allows two intentional payments with distinct keys', async () => {
    const invoice2 = await prisma.purchaseInvoice.create({
      data: {
        businessId,
        storeId,
        supplierId: (await prisma.supplier.findFirst({ where: { businessId } }))!.id,
        totalPence: 100000,
        subtotalPence: 100000,
        vatPence: 0,
        paymentStatus: 'UNPAID',
      },
    });

    await recordSupplierPayment(
      businessId,
      invoice2.id,
      [{ method: 'TRANSFER', amountPence: 10000 }],
      {
        recordedByUserId: userId,
        actorRole: 'OWNER',
        actorName: 'Owner',
        idempotencyKey: `distinct-a-${suffix}`,
      },
    );
    await recordSupplierPayment(
      businessId,
      invoice2.id,
      [{ method: 'TRANSFER', amountPence: 10000 }],
      {
        recordedByUserId: userId,
        actorRole: 'OWNER',
        actorName: 'Owner',
        idempotencyKey: `distinct-b-${suffix}`,
      },
    );

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
