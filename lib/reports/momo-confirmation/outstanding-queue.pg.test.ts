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
    const tillId = (await prisma.till.create({ data: { storeId, name: 'Till' } })).id;
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
    expect(await prisma.journalEntry.count({ where: { businessId } })).toBe(journalsBefore);
  });
});
