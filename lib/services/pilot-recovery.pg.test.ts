/** Real database recovery; auth/request plumbing mocked, financial services are real. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
const auth = vi.hoisted(() => ({ owner: null as any }));
vi.mock('@/lib/auth', () => ({ requireRole: async () => auth.owner, requireUser: async () => auth.owner }));
vi.mock('next/headers', () => ({ headers: () => new Headers(), cookies: () => ({ getAll: () => [], delete: vi.fn() }) }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: any) => fn }));
vi.mock('@/lib/services/risk-monitor', () => ({ detectVoidFrequencyRisk: vi.fn(), detectExcessiveDiscountRisk: vi.fn(), detectNegativeMarginRisk: vi.fn(), detectCashVarianceRisk: vi.fn() }));
const runPg = canRunLivePostgresTests() ? describe : describe.skip;
runPg('pilot financial recovery from complete application export', () => {
  let prisma: PrismaClient;
  let fixture: any;
  let backup: typeof import('@/app/actions/backup');
  let payments: typeof import('./payments');
  let snapshot: any;
  let ownerHash = '';
  beforeAll(async () => {
    ({ prisma } = await openTestPrismaClient());
    const { createPilotFixture } = createRequire(import.meta.url)('../../scripts/pilot-acceptance-fixture.cjs');
    fixture = await createPilotFixture(prisma, `recovery-${Date.now()}`);
    auth.owner = fixture.users.owner;
    ownerHash = fixture.users.owner.passwordHash;
    await prisma.user.update({ where: { id: auth.owner.id }, data: { twoFactorEnabled: true, twoFactorSecret: 'FICTIONAL-FACTOR', approvalPinHash: 'FICTIONAL-PIN-HASH' } });
    const accounting = await import('@/lib/accounting');
    await accounting.ensureChartOfAccounts(fixture.businessId, prisma);
    const sales = await import('./sales');
    payments = await import('./payments');
    const base = { businessId: fixture.businessId, storeId: fixture.stores[0].id, tillId: fixture.stores[0].tillId, cashierUserId: fixture.users.cashier1.id, capturedShiftId: fixture.stores[0].shiftId };
    const credit = await sales.createSale({ ...base, customerId: fixture.customer.id, paymentStatus: 'UNPAID', payments: [], lines: [{ productId: fixture.products[0].id, unitId: fixture.unitId, qtyInUnit: 1 }] });
    await payments.recordCustomerPayment(fixture.businessId, credit.id, [{ method: 'CASH', amountPence: 1000 }], fixture.users.cashier1.id, { idempotencyKey: 'recovery-receipt' });
    const momo = await sales.createSale({ ...base, paymentStatus: 'PAID', payments: [{ method: 'MOBILE_MONEY', amountPence: 5000 }], lines: [{ productId: fixture.products[1].id, unitId: fixture.unitId, qtyInUnit: 1 }] });
    const collection = await prisma.mobileMoneyCollection.create({ data: { businessId: fixture.businessId, storeId: base.storeId, salesInvoiceId: momo.id, initiatedByUserId: auth.owner.id, provider: 'SIMULATED', network: 'MTN', payerMsisdn: '233240000000', amountPence: 5000, idempotencyKey: `recovery-momo-${momo.id}`, status: 'PENDING', statusLogs: { create: { status: 'PENDING', notes: 'Clearly labelled isolated provider simulation' } } } });
    await prisma.salesPayment.updateMany({ where: { salesInvoiceId: momo.id }, data: { collectionId: collection.id } });
    await prisma.syncEvent.create({ data: { businessId: fixture.businessId, eventId: 'recovery-sync', eventType: 'SALE_CREATED', resultRef: credit.id, payloadHash: 'fixture' } });
    backup = await import('@/app/actions/backup');
    const exported = await backup.exportDatabaseAction();
    expect(exported.success).toBe(true);
    if (!exported.success) throw new Error(exported.error);
    snapshot = JSON.parse(JSON.stringify(exported.data));
    expect(snapshot.users.every((u: any) => u.passwordHash === undefined && u.twoFactorSecret === undefined)).toBe(true);
  }, 60000);

  afterAll(async () => {
    if (!fixture || !prisma) return;
    const businessId = fixture.businessId;
    const tenant = { businessId };
    await runTestTeardown(prisma, [
      () => prisma.auditLog.deleteMany({ where: tenant }),
      () => prisma.messageOutbox.deleteMany({ where: tenant }),
      () => prisma.cashDrawerEntry.deleteMany({ where: tenant }),
      () => prisma.moneyIdempotency.deleteMany({ where: tenant }),
      () => prisma.businessSequence.deleteMany({ where: tenant }),
      () => prisma.syncEvent.deleteMany({ where: tenant }),
      () => prisma.journalEntry.deleteMany({ where: tenant }),
      () => prisma.salesPayment.deleteMany({ where: { salesInvoice: tenant } }),
      () => prisma.mobileMoneyCollection.deleteMany({ where: tenant }),
      () => prisma.salesInvoice.deleteMany({ where: tenant }),
      () => prisma.stockMovement.deleteMany({ where: { store: tenant } }),
      () => prisma.inventoryBalance.deleteMany({ where: { store: tenant } }),
      () => prisma.product.deleteMany({ where: tenant }),
      () => prisma.category.deleteMany({ where: tenant }),
      () => prisma.unit.deleteMany({ where: { id: fixture.unitId } }),
      () => prisma.shift.deleteMany({ where: { till: { store: tenant } } }),
      () => prisma.till.deleteMany({ where: { store: tenant } }),
      () => prisma.customer.deleteMany({ where: tenant }),
      () => prisma.supplier.deleteMany({ where: tenant }),
      () => prisma.account.deleteMany({ where: tenant }),
      () => prisma.store.deleteMany({ where: tenant }),
      () => prisma.user.deleteMany({ where: tenant }),
      () => prisma.business.deleteMany({ where: { id: businessId } }),
    ], { label: 'pilot-recovery' });
  }, 60000);

  const controls = async () => ({
    stock: await prisma.inventoryBalance.findMany({ where: { store: { businessId: fixture.businessId } }, orderBy: { id: 'asc' } }),
    drawer: await prisma.cashDrawerEntry.findMany({ where: { businessId: fixture.businessId }, orderBy: { id: 'asc' } }),
    shifts: await prisma.shift.findMany({ where: { till: { store: { businessId: fixture.businessId } } }, orderBy: { id: 'asc' } }),
    journals: await prisma.journalEntry.findMany({ where: { businessId: fixture.businessId }, include: { lines: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } }),
    receipts: await prisma.salesPayment.findMany({ where: { salesInvoice: { businessId: fixture.businessId } }, orderBy: { id: 'asc' } }),
    replay: await prisma.moneyIdempotency.findMany({ where: { businessId: fixture.businessId }, orderBy: { id: 'asc' } }),
    collections: await prisma.mobileMoneyCollection.findMany({ where: { businessId: fixture.businessId }, orderBy: { id: 'asc' } }),
  });

  it('roundtrips drawer/stock/ledger/payment evidence, replay keys and owner access', async () => {
    const before = await controls();
    const restored = await backup.importDatabaseAction(snapshot);
    expect(restored).toMatchObject({ success: true });
    expect(await controls()).toEqual(before);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: auth.owner.id } })).passwordHash).toBe(ownerHash);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: auth.owner.id } })).toMatchObject({ twoFactorEnabled: true, twoFactorSecret: 'FICTIONAL-FACTOR', approvalPinHash: 'FICTIONAL-PIN-HASH' });
    const sale = snapshot.salesInvoices.find((row: any) => row.customerId === fixture.customer.id);
    await payments.recordCustomerPayment(fixture.businessId, sale.id, [{ method: 'CASH', amountPence: 1000 }], fixture.users.cashier1.id, { idempotencyKey: 'recovery-receipt' });
    expect(await controls()).toEqual(before);
  }, 60000);

  it('rolls back every deletion if insertion fails during restore', async () => {
    const before = await controls();
    const invalid = structuredClone(snapshot);
    invalid.products[0].name = null;
    const restored = await backup.importDatabaseAction(invalid);
    expect(restored.success).toBe(false);
    expect(await controls()).toEqual(before);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: auth.owner.id } })).passwordHash).toBe(ownerHash);
  }, 60000);

  it('refuses legacy incomplete evidence and ignores backup plan escalation', async () => {
    const before = await controls();
    const legacy = { ...snapshot, version: '1.3' };
    expect((await backup.importDatabaseAction(legacy)).success).toBe(false);
    expect(await controls()).toEqual(before);
    await prisma.business.update({ where: { id: fixture.businessId }, data: { plan: 'GROWTH', selectedPlan: 'GROWTH' } });
    expect((await backup.importDatabaseAction(snapshot)).success).toBe(true);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: fixture.businessId } })).plan).toBe('GROWTH');
  }, 60000);

  it('deduplicates recurring reminder enqueue without sending a provider message', async () => {
    const { enqueueSubscriptionReminder } = await import('@/lib/subscription-reminders');
    const business = await prisma.business.findUniqueOrThrow({ where: { id: fixture.businessId } });
    const input = { ...business, phone: '0240000000' };
    const first = await enqueueSubscriptionReminder(input, 'SUBSCRIPTION_RENEWS_3_DAYS', { tx: prisma });
    const second = await enqueueSubscriptionReminder(input, 'SUBSCRIPTION_RENEWS_3_DAYS', { tx: prisma });
    expect(first).toMatchObject({ ok: true, deduped: false });
    expect(second).toMatchObject({ ok: true, deduped: true });
    expect(await prisma.messageOutbox.count({ where: { businessId: fixture.businessId } })).toBe(1);
  });
});
