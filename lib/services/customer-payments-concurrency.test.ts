/**
 * Overlapping-transaction concurrency evidence for customer-receipt idempotency.
 *
 * Requires a real Postgres DATABASE_URL. Without it these tests are skipped.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';

const databaseUrl = process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);

const describeConcurrency = canRun ? describe : describe.skip;

describeConcurrency('customer payment overlapping transactions (Postgres)', () => {
  let prisma: PrismaClient;
  let recordCustomerPayment: typeof import('@/lib/services/payments').recordCustomerPayment;
  const suffix = `cp-conc-${Date.now()}`;
  let businessId = '';
  let storeId = '';
  let tillId = '';
  let userId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();
    const payments = await import('@/lib/services/payments');
    recordCustomerPayment = payments.recordCustomerPayment;

    prisma = new PrismaClient();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: {
        name: `CP Conc ${suffix}`,
        currency: 'GHS',
        accounts: {
          create: [
            { code: '1000', name: 'Cash', type: 'ASSET' },
            { code: '1010', name: 'Bank', type: 'ASSET' },
            { code: '1100', name: 'Accounts Receivable', type: 'ASSET' },
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
    tillId = till.id;

    await prisma.shift.create({
      data: {
        tillId,
        userId,
        status: 'OPEN',
        openingCashPence: 50000,
        expectedCashPence: 50000,
      },
    });
  }, 90000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.moneyIdempotency.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.journalLine.deleteMany({ where: { journalEntry: { businessId } } }).catch(() => {});
    await prisma.journalEntry.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.cashDrawerEntry.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId } } }).catch(() => {});
    await prisma.salesInvoice.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.shift.deleteMany({ where: { till: { storeId } } }).catch(() => {});
    await prisma.till.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.account.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.store.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: businessId } }).catch(() => {});
    await prisma.$disconnect();
  }, 90000);

  async function createUnpaidInvoice(totalPence: number) {
    return prisma.salesInvoice.create({
      data: {
        businessId,
        storeId,
        tillId,
        cashierUserId: userId,
        paymentStatus: 'UNPAID',
        subtotalPence: totalPence,
        vatPence: 0,
        totalPence,
      },
    });
  }

  it('rejects two simultaneous customer payments that would overpay', async () => {
    const invoice = await createUnpaidInvoice(10000);

    const results = await Promise.allSettled([
      recordCustomerPayment(
        businessId,
        invoice.id,
        [{ method: 'TRANSFER', amountPence: 6000 }],
        userId,
        { idempotencyKey: `overpay-a-${suffix}` },
      ),
      recordCustomerPayment(
        businessId,
        invoice.id,
        [{ method: 'TRANSFER', amountPence: 6000 }],
        userId,
        { idempotencyKey: `overpay-b-${suffix}` },
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason?.message).toMatch(/exceeds outstanding/i);

    const payments = await prisma.salesPayment.findMany({
      where: { salesInvoiceId: invoice.id },
    });
    expect(payments).toHaveLength(1);
    expect(sumAmount(payments)).toBeLessThanOrEqual(10000);
  }, 60000);

  it('replays an exact customer payment without a second post', async () => {
    const invoice = await createUnpaidInvoice(8000);
    const key = `replay-${suffix}`;
    const payload = [{ method: 'TRANSFER' as const, amountPence: 3000 }];

    const first = await recordCustomerPayment(businessId, invoice.id, payload, userId, {
      idempotencyKey: key,
    });
    const second = await recordCustomerPayment(businessId, invoice.id, payload, userId, {
      idempotencyKey: key,
    });

    expect(first.id).toBe(invoice.id);
    expect(second.id).toBe(invoice.id);
    expect(await prisma.salesPayment.count({ where: { salesInvoiceId: invoice.id } })).toBe(1);
    expect(
      await prisma.journalEntry.count({
        where: { businessId, referenceType: 'CUSTOMER_RECEIPT', referenceId: invoice.id },
      }),
    ).toBe(1);
  }, 60000);

  it('rejects the same key with a different amount', async () => {
    const invoice = await createUnpaidInvoice(8000);
    const key = `mismatch-${suffix}`;

    await recordCustomerPayment(
      businessId,
      invoice.id,
      [{ method: 'TRANSFER', amountPence: 2000 }],
      userId,
      { idempotencyKey: key },
    );

    await expect(
      recordCustomerPayment(
        businessId,
        invoice.id,
        [{ method: 'TRANSFER', amountPence: 3000 }],
        userId,
        { idempotencyKey: key },
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

    expect(await prisma.salesPayment.count({ where: { salesInvoiceId: invoice.id } })).toBe(1);
  }, 60000);
});

function sumAmount(rows: Array<{ amountPence: number }>) {
  return rows.reduce((sum, row) => sum + row.amountPence, 0);
}

describe('customer payment concurrency suite availability', () => {
  it('reports when overlapping Postgres tests are skipped', () => {
    expect(typeof canRun).toBe('boolean');
  });
});
