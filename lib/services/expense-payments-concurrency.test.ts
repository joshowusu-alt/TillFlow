/**
 * Overlapping-transaction concurrency evidence for expense-payment idempotency.
 *
 * Requires a real Postgres DATABASE_URL. Without it these tests are skipped.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';

const databaseUrl = process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);

const describeConcurrency = canRun ? describe : describe.skip;

describeConcurrency('expense payment overlapping transactions (Postgres)', () => {
  let prisma: PrismaClient;
  let recordExpensePayment: typeof import('@/lib/services/expensePayments').recordExpensePayment;
  const suffix = `ep-conc-${Date.now()}`;
  let businessId = '';
  let storeId = '';
  let userId = '';
  let accountId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();
    const expensePayments = await import('@/lib/services/expensePayments');
    recordExpensePayment = expensePayments.recordExpensePayment;

    prisma = new PrismaClient();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: {
        name: `EP Conc ${suffix}`,
        currency: 'GHS',
        accounts: {
          create: [
            { code: '1000', name: 'Cash', type: 'ASSET' },
            { code: '1010', name: 'Bank', type: 'ASSET' },
            { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
            { code: '6000', name: 'Operating Expenses', type: 'EXPENSE' },
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

    const account = await prisma.account.findFirstOrThrow({
      where: { businessId, code: '6000' },
    });
    accountId = account.id;
  }, 90000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.moneyIdempotency.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.journalLine.deleteMany({ where: { journalEntry: { businessId } } }).catch(() => {});
    await prisma.journalEntry.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.expensePayment.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.expense.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.account.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.store.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: businessId } }).catch(() => {});
    await prisma.$disconnect();
  }, 90000);

  it('rejects two simultaneous expense payments that would overpay', async () => {
    const expense = await prisma.expense.create({
      data: {
        businessId,
        storeId,
        userId,
        accountId,
        amountPence: 10000,
        paymentStatus: 'UNPAID',
      },
    });

    const results = await Promise.allSettled([
      recordExpensePayment({
        businessId,
        storeId,
        userId,
        expenseId: expense.id,
        method: 'TRANSFER',
        amountPence: 6000,
        idempotencyKey: `overpay-a-${suffix}`,
      }),
      recordExpensePayment({
        businessId,
        storeId,
        userId,
        expenseId: expense.id,
        method: 'TRANSFER',
        amountPence: 6000,
        idempotencyKey: `overpay-b-${suffix}`,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason?.message).toMatch(/exceeds outstanding/i);

    const payments = await prisma.expensePayment.findMany({ where: { expenseId: expense.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]!.amountPence).toBe(6000);
  }, 60000);
});

describe('expense payment concurrency suite availability', () => {
  it('reports when overlapping Postgres tests are skipped', () => {
    expect(typeof canRun).toBe('boolean');
  });
});
