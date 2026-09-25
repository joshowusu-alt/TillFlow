import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const describePg = canRunLivePostgresTests() ? describe : describe.skip;

describePg('Wave A cross-surface reconciliation (Postgres)', () => {
  let prisma: PrismaClient;
  const suffix = `wave-a-${Date.now()}`;
  let businessId = '';

  beforeAll(async () => {
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();
    ({ prisma } = await openTestPrismaClient());

    const due = new Date(Date.now() + 2 * 86_400_000);
    const business = await prisma.business.create({
      data: { name: `Wave A ${suffix}`, currency: 'GHS', timezone: 'Africa/Nairobi', whatsappEnabled: true, phone: '+233200000099', subscriptionStatus: 'ACTIVE' },
    });
    businessId = business.id;
    const store = await prisma.store.create({ data: { businessId, name: 'Main' } });
    const user = await prisma.user.create({
      data: { businessId, email: `${suffix}@example.com`, name: 'Owner', role: 'OWNER', passwordHash: 'x' },
    });
    const till = await prisma.till.create({ data: { storeId: store.id, name: 'Till' } });
    const customer = await prisma.customer.create({ data: { businessId, storeId: store.id, name: 'Ada' } });
    const supplier = await prisma.supplier.create({ data: { businessId, name: 'Supplier' } });
    const unit = await prisma.unit.create({ data: { name: 'Piece', pluralName: 'Pieces' } });
    const product = await prisma.product.create({
      data: { businessId, name: 'Oil', sellingPriceBasePence: 2000, defaultCostBasePence: 834 },
    });

    const saleBase = {
      businessId,
      storeId: store.id,
      tillId: till.id,
      cashierUserId: user.id,
      customerId: customer.id,
      dueDate: due,
      subtotalPence: 0,
      vatPence: 0,
    };

    await prisma.salesInvoice.create({
      data: { ...saleBase, paymentStatus: 'UNPAID', totalPence: 9000, subtotalPence: 9000, payments: { create: { method: 'CASH', amountPence: 6000, status: 'PENDING', receivedAt: new Date() } } },
    });
    await prisma.salesInvoice.create({
      data: { ...saleBase, paymentStatus: 'PAID', totalPence: 5833, subtotalPence: 5833 },
    });
    await prisma.salesInvoice.create({
      data: { ...saleBase, paymentStatus: 'PAID', totalPence: 10000, subtotalPence: 10000, payments: { create: { method: 'CASH', amountPence: 12000, status: 'CONFIRMED', receivedAt: new Date() } } },
    });
    await prisma.salesInvoice.create({
      data: { ...saleBase, paymentStatus: 'RETURNED', totalPence: 5000, subtotalPence: 5000 },
    });
    await prisma.salesInvoice.create({
      data: { ...saleBase, paymentStatus: 'VOID', totalPence: 4000, subtotalPence: 4000 },
    });
    await prisma.salesInvoice.create({
      data: {
        ...saleBase,
        paymentStatus: 'PAID',
        subtotalPence: 2000,
        discountPence: 0,
        vatPence: 0,
        totalPence: 1849,
        payments: { create: { method: 'CASH', amountPence: 1849, status: 'CONFIRMED', receivedAt: new Date() } },
        lines: {
          create: {
            productId: product.id,
            unitId: unit.id,
            qtyInUnit: 1,
            qtyBase: 1,
            unitPricePence: 2000,
            lineDiscountPence: 100,
            promoDiscountPence: 51,
            lineSubtotalPence: 2000,
            lineVatPence: 0,
            lineTotalPence: 1849,
            lineCostPence: 834,
          },
        },
      },
    });

    const purchaseBase = { businessId, storeId: store.id, supplierId: supplier.id, dueDate: due, subtotalPence: 0, vatPence: 0 };
    await prisma.purchaseInvoice.create({ data: { ...purchaseBase, paymentStatus: 'UNPAID', totalPence: 7000, subtotalPence: 7000 } });
    await prisma.purchaseInvoice.create({ data: { ...purchaseBase, paymentStatus: 'PAID', totalPence: 3500, subtotalPence: 3500 } });
    await prisma.purchaseInvoice.create({
      data: { ...purchaseBase, paymentStatus: 'PAID', totalPence: 2000, subtotalPence: 2000, payments: { create: { amountPence: 1000, method: 'CASH', paidAt: new Date() } } },
    });
    await prisma.purchaseInvoice.create({
      data: { ...purchaseBase, paymentStatus: 'PAID', totalPence: 1000, subtotalPence: 1000, payments: { create: { amountPence: 2000, method: 'CASH', paidAt: new Date() } } },
    });
    await prisma.purchaseInvoice.create({ data: { ...purchaseBase, paymentStatus: 'RETURNED', totalPence: 900, subtotalPence: 900 } });
    await prisma.purchaseInvoice.create({ data: { ...purchaseBase, paymentStatus: 'VOID', totalPence: 800, subtotalPence: 800 } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await runTestTeardown(prisma, [
      () => prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId } } }),
      () => prisma.salesInvoiceLine.deleteMany({ where: { salesInvoice: { businessId } } }),
      () => prisma.salesInvoice.deleteMany({ where: { businessId } }),
      () => prisma.purchasePayment.deleteMany({ where: { purchaseInvoice: { businessId } } }),
      () => prisma.purchaseInvoice.deleteMany({ where: { businessId } }),
      () => prisma.till.deleteMany({ where: { store: { businessId } } }),
      () => prisma.customer.deleteMany({ where: { businessId } }),
      () => prisma.supplier.deleteMany({ where: { businessId } }),
      () => prisma.product.deleteMany({ where: { businessId } }),
      () => prisma.store.deleteMany({ where: { businessId } }),
      () => prisma.user.deleteMany({ where: { businessId } }),
      () => prisma.business.delete({ where: { id: businessId } }),
    ]);
  });

  it('reconciles canonical AR 12833, AP 10500, and ready GP 1015', async () => {
    const sales = await prisma.salesInvoice.findMany({
      where: { businessId },
      select: { paymentStatus: true, totalPence: true, payments: { select: { amountPence: true, status: true } } },
    });
    const purchases = await prisma.purchaseInvoice.findMany({
      where: { businessId },
      select: { paymentStatus: true, totalPence: true, payments: { select: { amountPence: true } } },
    });
    const helperAr = sales.reduce((sum, invoice) => sum + receivableDocumentBalance(invoice).balancePence, 0);
    const helperAp = purchases.reduce((sum, invoice) => sum + payableDocumentBalance(invoice).balancePence, 0);
    expect(helperAr).toBe(12833);
    expect(helperAp).toBe(10500);

    const { getTodayKPIs } = await import('@/lib/reports/today-kpis');
    const kpis = await getTodayKPIs(businessId);
    expect(kpis.outstandingARPence).toBe(12833);
    expect(kpis.outstandingAPPence).toBe(10500);
    expect(kpis.marginState).toBe('READY');
    expect(kpis.grossMarginPence).toBe(1015);

    const { getOwnerBrief } = await import('@/lib/owner-intel');
    const brief = await getOwnerBrief(businessId, 'GHS');
    expect(brief.moneyPulse.arDue7DaysPence).toBe(12833);
    expect(brief.moneyPulse.apDue7DaysPence).toBe(10500);

    const { getCashflowForecast } = await import('@/lib/reports/forecast');
    const forecast = await getCashflowForecast(businessId, 14);
    expect(forecast.arInputPence).toBe(12833);
    expect(forecast.apInputPence).toBe(10500);
  });
});
