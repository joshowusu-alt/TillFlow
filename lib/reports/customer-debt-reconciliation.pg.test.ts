import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';

const describePg = canRunLivePostgresTests() ? describe : describe.skip;

describePg('customer debt reconciliation on an isolated PostgreSQL fixture', () => {
  let prisma: PrismaClient;
  let businessId = '';
  let storeId = '';
  let otherStoreId = '';
  let customerId = '';
  const suffix = `customer-debt-${Date.now()}`;

  beforeAll(async () => {
    const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };
    if (globalPrisma.prisma) await globalPrisma.prisma.$disconnect();
    globalPrisma.prisma = undefined;
    vi.resetModules();
    ({ prisma } = await openTestPrismaClient());
    businessId = (await prisma.business.create({ data: { name: suffix, currency: 'GHS', customerScope: 'BUSINESS' } })).id;
    storeId = (await prisma.store.create({ data: { businessId, name: 'A' } })).id;
    otherStoreId = (await prisma.store.create({ data: { businessId, name: 'B' } })).id;
    const userId = (await prisma.user.create({ data: { businessId, email: `${suffix}@example.com`, name: 'Owner', role: 'OWNER', passwordHash: 'fixture' } })).id;
    const tillId = (await prisma.till.create({ data: { storeId, name: 'Till' } })).id;
    customerId = (await prisma.customer.create({ data: { businessId, storeId, name: 'Z Customer with debt' } })).id;
    await prisma.customer.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ businessId, storeId, name: `A Account ${i}` })) });
    const base = { businessId, storeId, tillId, cashierUserId: userId, subtotalPence: 0, vatPence: 0, paymentStatus: 'UNPAID' };
    await prisma.salesInvoice.create({ data: { ...base, customerId, totalPence: 64_850 } });
    for (const totalPence of [42_000, 873_950, 960_950]) {
      await prisma.salesInvoice.create({ data: { ...base, totalPence, payments: { create: { method: 'MOBILE_MONEY', amountPence: totalPence, status: 'PENDING_MANUAL' } } } });
    }
  });

  afterAll(async () => {
    if (!prisma || !businessId) return;
    await runTestTeardown(prisma, [
      () => prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId } } }),
      () => prisma.salesInvoice.deleteMany({ where: { businessId } }),
      () => prisma.customer.deleteMany({ where: { businessId } }),
      () => prisma.till.deleteMany({ where: { store: { businessId } } }),
      () => prisma.store.deleteMany({ where: { businessId } }),
      () => prisma.user.deleteMany({ where: { businessId } }),
      () => prisma.business.delete({ where: { id: businessId } }),
    ]);
  });

  it('reconciles named-account debt with Customers even when the debtor is off the first page', async () => {
    const { getCustomers } = await import('@/lib/services/customers');
    const { loadTradingOpenDocuments } = await import('@/lib/reports/trading-balances');
    const listed = await getCustomers(businessId, { pageSize: 20 });
    const trading = await loadTradingOpenDocuments(businessId, storeId);
    expect(listed.customers.every(customer => customer.outstandingBalancePence === 0)).toBe(true);
    expect(listed.accountSummary.customerCount).toBe(31);
    expect(listed.accountSummary.outstandingBalancePence).toBe(64_850);
    expect(listed.accountSummary.customersWithBalanceCount).toBe(1);
    expect(trading.outstandingARPence).toBe(1_941_750);
    expect(trading.customerDebt.customerBalancePence).toBe(64_850);
    expect(trading.customerDebt.unlinkedDuePence).toBe(1_876_900);
    const filtered = await getCustomers(businessId, { balanceDue: true });
    expect(filtered.totalCount).toBe(1);
    expect(filtered.customers[0].id).toBe(customerId);
  });

  it('keeps account-branch scoping separate from Trading sales-branch scoping', async () => {
    const { getCustomerAccountSummary } = await import('@/lib/services/customers');
    const { loadTradingOpenDocuments } = await import('@/lib/reports/trading-balances');
    expect((await getCustomerAccountSummary(businessId, otherStoreId)).outstandingBalancePence).toBe(0);
    expect((await getCustomerAccountSummary(businessId, storeId)).outstandingBalancePence).toBe(64_850);
    expect((await loadTradingOpenDocuments(businessId, otherStoreId)).customerDebt.documentBalancePence).toBe(0);
  });
});
