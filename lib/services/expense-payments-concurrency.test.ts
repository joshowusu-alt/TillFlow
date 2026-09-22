/**
 * Overlapping-transaction concurrency evidence for expense-payment idempotency.
 *
 * Requires a real Postgres DATABASE_URL. Without it these tests are skipped.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';

const canRun = canRunLivePostgresTests();

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
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();
    const expensePayments = await import('@/lib/services/expensePayments');
    recordExpensePayment = expensePayments.recordExpensePayment;

    ({ prisma } = await openTestPrismaClient());

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
    await runTestTeardown(prisma, [
      () => prisma.moneyIdempotency.deleteMany({ where: { businessId } }),
      () => prisma.journalLine.deleteMany({ where: { journalEntry: { businessId } } }),
      () => prisma.journalEntry.deleteMany({ where: { businessId } }),
      () => prisma.cashDrawerEntry.deleteMany({ where: { businessId } }),
      () => prisma.expensePayment.deleteMany({ where: { businessId } }),
      () => prisma.expense.deleteMany({ where: { businessId } }),
      () => prisma.shift.deleteMany({ where: { till: { store: { businessId } } } }),
      () => prisma.till.deleteMany({ where: { store: { businessId } } }),
      () => prisma.businessSequence.deleteMany({ where: { businessId } }),
      () => prisma.auditLog.deleteMany({ where: { businessId } }),
      () => prisma.user.deleteMany({ where: { businessId } }),
      () => prisma.account.deleteMany({ where: { businessId } }),
      () => prisma.store.deleteMany({ where: { businessId } }),
      () => prisma.business.deleteMany({ where: { id: businessId } }),
    ], { label: 'expense-payments-concurrency' });
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

  it('rejects a foreign-store till atomically, then pays once on the same-store till', async () => {
    // Store A (expense + Till A1 open) and Store B (Till B1 open). Paying a Store A
    // expense with Till B1 must fail before any write; Till A1 must succeed exactly once.
    const storeB = await prisma.store.create({ data: { businessId, name: `Store B ${suffix}` } });
    const [tillA1, tillB1] = await Promise.all([
      prisma.till.create({ data: { storeId, name: `Till A1 ${suffix}` } }),
      prisma.till.create({ data: { storeId: storeB.id, name: `Till B1 ${suffix}` } }),
    ]);
    const [shiftA1, shiftB1] = await Promise.all([
      prisma.shift.create({ data: { tillId: tillA1.id, userId, openingCashPence: 10000, expectedCashPence: 10000, status: 'OPEN' } }),
      prisma.shift.create({ data: { tillId: tillB1.id, userId, openingCashPence: 10000, expectedCashPence: 10000, status: 'OPEN' } }),
    ]);
    const expense = await prisma.expense.create({
      data: { businessId, storeId, userId, accountId, amountPence: 5000, paymentStatus: 'UNPAID' },
    });

    const snapshot = async () => {
      const [payments, drawerA, drawerB, journals, idem, shiftRows, exp] = await Promise.all([
        prisma.expensePayment.count({ where: { expenseId: expense.id } }),
        prisma.cashDrawerEntry.count({ where: { shiftId: shiftA1.id } }),
        prisma.cashDrawerEntry.count({ where: { shiftId: shiftB1.id } }),
        prisma.journalEntry.count({ where: { businessId, referenceType: 'EXPENSE_PAYMENT' } }),
        prisma.moneyIdempotency.count({ where: { businessId, key: { startsWith: `foreign-till-${suffix}` } } }),
        prisma.shift.findMany({ where: { id: { in: [shiftA1.id, shiftB1.id] } }, select: { id: true, expectedCashPence: true }, orderBy: { id: 'asc' } }),
        prisma.expense.findUniqueOrThrow({ where: { id: expense.id }, select: { paymentStatus: true } }),
      ]);
      return { payments, drawerA, drawerB, journals, idem, shiftRows, status: exp.paymentStatus };
    };

    const before = await snapshot();
    await expect(
      recordExpensePayment({
        businessId,
        storeId,
        userId,
        expenseId: expense.id,
        method: 'CASH',
        amountPence: 1000,
        tillId: tillB1.id,
        idempotencyKey: `foreign-till-${suffix}`,
      }),
    ).rejects.toThrow();
    const afterForged = await snapshot();
    expect(afterForged).toEqual(before);
    expect(afterForged.payments).toBe(0);
    expect(afterForged.drawerB).toBe(0);
    expect(afterForged.idem).toBe(0);
    expect(afterForged.status).toBe('UNPAID');

    const paid = await recordExpensePayment({
      businessId,
      storeId,
      userId,
      expenseId: expense.id,
      method: 'CASH',
      amountPence: 1000,
      tillId: tillA1.id,
      idempotencyKey: `same-store-till-${suffix}`,
    });
    expect(paid.expenseId).toBe(expense.id);
    const afterValid = await snapshot();
    expect(afterValid.payments).toBe(1);
    expect(afterValid.drawerA).toBe(1);
    expect(afterValid.drawerB).toBe(0);
    expect(afterValid.status).toBe('PART_PAID');
    const entry = await prisma.cashDrawerEntry.findFirstOrThrow({ where: { shiftId: shiftA1.id } });
    expect(entry.tillId).toBe(tillA1.id);
    expect(entry.amountPence).toBe(-1000);

    await prisma.cashDrawerEntry.deleteMany({ where: { shiftId: { in: [shiftA1.id, shiftB1.id] } } });
    await prisma.shift.deleteMany({ where: { id: { in: [shiftA1.id, shiftB1.id] } } });
    await prisma.expensePayment.deleteMany({ where: { expenseId: expense.id } });
    await prisma.expense.deleteMany({ where: { id: expense.id } });
    await prisma.till.deleteMany({ where: { id: { in: [tillA1.id, tillB1.id] } } });
    await prisma.store.deleteMany({ where: { id: storeB.id } });
  }, 60000);

  it('allocates a later payment to the exact expenseId and leaves a sibling unpaid', async () => {
    const [target, sibling] = await Promise.all([
      prisma.expense.create({
        data: {
          businessId,
          storeId,
          userId,
          accountId,
          amountPence: 8000,
          paymentStatus: 'UNPAID',
        },
      }),
      prisma.expense.create({
        data: {
          businessId,
          storeId,
          userId,
          accountId,
          amountPence: 8000,
          paymentStatus: 'UNPAID',
        },
      }),
    ]);

    const payment = await recordExpensePayment({
      businessId,
      storeId,
      userId,
      expenseId: target.id,
      method: 'TRANSFER',
      amountPence: 3000,
      idempotencyKey: `alloc-${suffix}`,
    });

    expect(payment.expenseId).toBe(target.id);
    const [targetPayments, siblingPayments] = await Promise.all([
      prisma.expensePayment.findMany({ where: { expenseId: target.id } }),
      prisma.expensePayment.findMany({ where: { expenseId: sibling.id } }),
    ]);
    expect(targetPayments).toHaveLength(1);
    expect(targetPayments[0]!.amountPence).toBe(3000);
    expect(siblingPayments).toHaveLength(0);
  }, 60000);
});

describe('expense payment concurrency suite availability', () => {
  it('reports when overlapping Postgres tests are skipped', () => {
    expect(typeof canRun).toBe('boolean');
  });
});
