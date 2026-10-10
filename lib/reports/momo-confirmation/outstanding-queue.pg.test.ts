import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';

const describePg = canRunLivePostgresTests() ? describe : describe.skip;

describePg('outstanding manual MoMo queue on an isolated PostgreSQL fixture', () => {
  let prisma: PrismaClient;
  let businessId = '';
  let storeId = '';
  let userId = '';
  let paymentId = '';
  let tillId = '';
  const suffix = `momo-outstanding-${Date.now()}`;
  const receivedAt = new Date('2026-08-01T12:00:00.000Z');

  beforeAll(async () => {
    const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };
    if (globalPrisma.prisma) await globalPrisma.prisma.$disconnect();
    globalPrisma.prisma = undefined;
    vi.resetModules();
    ({ prisma } = await openTestPrismaClient());
    businessId = (await prisma.business.create({ data: { name: suffix, currency: 'GHS' } })).id;
    storeId = (await prisma.store.create({ data: { businessId, name: 'Fixture' } })).id;
    userId = (await prisma.user.create({
      data: { businessId, email: `${suffix}@example.com`, name: 'Owner', role: 'OWNER', passwordHash: 'fixture' },
    })).id;
    tillId = (await prisma.till.create({ data: { storeId, name: 'Till' } })).id;
    const invoice = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId,
        tillId,
        cashierUserId: userId,
        paymentStatus: 'PAID',
        subtotalPence: 50_000,
        vatPence: 0,
        totalPence: 50_000,
        payments: {
          create: {
            method: 'MOBILE_MONEY',
            amountPence: 50_000,
            status: 'PENDING_MANUAL',
            network: 'MTN',
            receivedAt,
          },
        },
      },
      include: { payments: true },
    });
    paymentId = invoice.payments[0].id;
  });

  afterAll(async () => {
    if (!prisma || !businessId) return;
    await runTestTeardown(prisma, [
      () => prisma.auditLog.deleteMany({ where: { businessId } }),
      () => prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId } } }),
      () => prisma.salesInvoice.deleteMany({ where: { businessId } }),
      () => prisma.till.deleteMany({ where: { store: { businessId } } }),
      () => prisma.store.deleteMany({ where: { businessId } }),
      () => prisma.user.deleteMany({ where: { businessId } }),
      () => prisma.business.delete({ where: { id: businessId } }),
    ]);
  });

  it('hides an older pending receipt from a date window and shows it on the outstanding queue', async () => {
    const { listMomoConfirmationPayments } = await import('@/lib/reports/momo-confirmation/query');
    const filters = {
      businessId,
      branchIds: [storeId],
      periodStart: new Date('2026-09-07T00:00:00.000Z'),
      periodEndExclusive: new Date('2026-10-07T00:00:00.000Z'),
      status: 'PENDING_MANUAL',
      saleStatus: 'ALL',
      cashierUserId: 'ALL',
    };
    const period = await listMomoConfirmationPayments(prisma, { ...filters, receiptScope: 'period' }, 1, 25);
    const outstanding = await listMomoConfirmationPayments(prisma, { ...filters, receiptScope: 'outstanding' }, 1, 25);
    expect(period.totalCount).toBe(0);
    expect(outstanding.totalCount).toBe(1);
    expect(outstanding.rows[0]?.paymentId).toBe(paymentId);
    expect(outstanding.rows[0]?.saleStatus).toBe('PAID');
    const invoice = await prisma.salesInvoice.findFirstOrThrow({
      where: { id: outstanding.rows[0].salesInvoiceId },
      include: { payments: true },
    });
    expect(receivableDocumentBalance(invoice).balancePence).toBe(50_000);
  });

  it('confirms the receipt once, drops the balance once, and does not post another journal', async () => {
    const journalsBefore = await prisma.journalEntry.count({ where: { businessId } });
    const { confirmMomoPayment } = await import('@/lib/services/momo-confirmation');
    const actor = {
      userId,
      userName: 'Owner',
      userRole: 'OWNER',
      businessId,
    };
    const first = await confirmMomoPayment({
      paymentId,
      reference: 'STMT-1001',
      note: 'Matched the MoMo statement',
      actor,
      authorisedStoreIds: [storeId],
    });
    const second = await confirmMomoPayment({
      paymentId,
      reference: 'STMT-1001',
      note: 'Retry of the same confirmation',
      actor,
      authorisedStoreIds: [storeId],
    });
    expect(first.alreadyConfirmed).toBe(false);
    expect(second.alreadyConfirmed).toBe(true);
    expect(second.receivedAt.toISOString()).toBe(receivedAt.toISOString());
    const payment = await prisma.salesPayment.findUniqueOrThrow({ where: { id: paymentId } });
    const invoice = await prisma.salesInvoice.findUniqueOrThrow({
      where: { id: payment.salesInvoiceId },
      include: { payments: true },
    });
    expect(invoice.paymentStatus).toBe('PAID');
    expect(payment.status).toBe('CONFIRMED');
    expect(payment.receivedAt.toISOString()).toBe(receivedAt.toISOString());
    expect(receivableDocumentBalance(invoice).balancePence).toBe(0);
    expect(await prisma.auditLog.count({ where: { businessId, action: 'MOMO_PAYMENT_CONFIRM', entityId: paymentId } })).toBe(1);
    expect(await prisma.salesPayment.count({ where: { salesInvoiceId: invoice.id } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { businessId } })).toBe(journalsBefore);
  });

  it('blocks returned and void receipts and excludes them from the eligible total', async () => {
    const { confirmMomoPayment, MomoConfirmError } = await import('@/lib/services/momo-confirmation');
    const { summarizeMomoConfirmationActionability } = await import('@/lib/reports/momo-confirmation/query');
    const actor = { userId, userName: 'Owner', userRole: 'OWNER', businessId };
    for (const paymentStatus of ['RETURNED', 'VOID'] as const) {
      const invoice = await prisma.salesInvoice.create({
        data: {
          businessId,
          storeId,
          tillId,
          cashierUserId: userId,
          paymentStatus,
          subtotalPence: 5_200,
          vatPence: 0,
          totalPence: 5_200,
          payments: {
            create: {
              method: 'MOBILE_MONEY',
              amountPence: 5_200,
              status: 'PENDING_MANUAL',
              receivedAt: new Date('2026-06-08T19:52:09.608Z'),
            },
          },
        },
        include: { payments: true },
      });
      await expect(
        confirmMomoPayment({
          paymentId: invoice.payments[0].id,
          reference: 'STMT-CLOSED',
          note: 'Must not confirm a closed sale',
          actor,
          authorisedStoreIds: [storeId],
        }),
      ).rejects.toBeInstanceOf(MomoConfirmError);
      const stillPending = await prisma.salesPayment.findUniqueOrThrow({ where: { id: invoice.payments[0].id } });
      expect(stillPending.status).toBe('PENDING_MANUAL');
    }
    const summary = await summarizeMomoConfirmationActionability(prisma, {
      businessId,
      branchIds: [storeId],
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEndExclusive: new Date('2026-11-01T00:00:00.000Z'),
      status: 'PENDING_MANUAL',
      saleStatus: 'ALL',
      cashierUserId: 'ALL',
      receiptScope: 'outstanding',
    });
    expect(summary.blockedCount).toBe(2);
    expect(summary.blockedAmountPence).toBe(10_400);
    expect(summary.eligibleCount).toBe(0);
    expect(summary.eligibleAmountPence).toBe(0);
  });

  it('lets one of two concurrent confirmations win and writes a single audit', async () => {
    const invoice = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId,
        tillId,
        cashierUserId: userId,
        paymentStatus: 'PAID',
        subtotalPence: 4_100,
        vatPence: 0,
        totalPence: 4_100,
        payments: {
          create: {
            method: 'MOBILE_MONEY',
            amountPence: 4_100,
            status: 'PENDING_MANUAL',
            receivedAt: new Date('2026-08-02T12:00:00.000Z'),
          },
        },
      },
      include: { payments: true },
    });
    const racedPaymentId = invoice.payments[0].id;
    const journalsBefore = await prisma.journalEntry.count({ where: { businessId } });
    const { confirmMomoPayment } = await import('@/lib/services/momo-confirmation');
    const actor = { userId, userName: 'Owner', userRole: 'OWNER', businessId };
    const attempt = () =>
      confirmMomoPayment({
        paymentId: racedPaymentId,
        reference: 'STMT-RACE',
        note: 'Concurrent confirmation attempt',
        actor,
        authorisedStoreIds: [storeId],
      });
    const [left, right] = await Promise.all([attempt(), attempt()]);
    expect([left.alreadyConfirmed, right.alreadyConfirmed].sort()).toEqual([false, true]);
    expect(await prisma.salesPayment.count({ where: { salesInvoiceId: invoice.id, status: 'CONFIRMED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { businessId, action: 'MOMO_PAYMENT_CONFIRM', entityId: racedPaymentId } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { businessId } })).toBe(journalsBefore);
  });
});
