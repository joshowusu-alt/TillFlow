/** Persist real financial evidence for the subsequent native backup/restore drill. */
import { afterAll, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient } from '@/lib/test/test-prisma';
import { purchaseDocumentFixture } from '@/lib/test/purchase-document-fixture';

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/headers', () => ({ headers: () => new Headers() }));
vi.mock('@/lib/action-utils', () => ({ UserError: class UserError extends Error {} }));
vi.mock('@/lib/services/risk-monitor', () => ({
  detectVoidFrequencyRisk: vi.fn().mockResolvedValue(undefined), detectExcessiveDiscountRisk: vi.fn().mockResolvedValue(undefined),
  detectNegativeMarginRisk: vi.fn().mockResolvedValue(undefined), detectCashVarianceRisk: vi.fn().mockResolvedValue(undefined),
}));

let prisma: PrismaClient | undefined;
afterAll(async () => { await prisma?.$disconnect(); });
const enabled = canRunLivePostgresTests() && process.env.TILLFLOW_RUN_FULL_DB_RECOVERY === '1';
(enabled ? it : it.skip)('persists debtor, supplier, stock and expense evidence for full database recovery', async () => {
  ({ prisma } = await openTestPrismaClient());
  const f = JSON.parse(fs.readFileSync(process.env.PILOT_FIXTURE_PATH || 'tmp/pilot-acceptance.json', 'utf8'));
  const business = await prisma.business.findUniqueOrThrow({ where: { id: f.businessId } });
  expect(business.name).toMatch(/^FICTIONAL/);
  const sales = await import('./sales');
  const payments = await import('./payments');
  const purchases = await import('./purchases');
  const expenses = await import('./expenses');
  const store = f.stores[0];
  const credit = await sales.createSale({ businessId: f.businessId, storeId: store.id, tillId: store.tillId,
    capturedShiftId: store.shiftId, cashierUserId: f.users.cashier1.id, customerId: f.customer.id,
    externalRef: `OFFLINE_SYNC:native-recovery-${f.run}`, paymentStatus: 'UNPAID', payments: [],
    lines: [{ productId: f.products[0].id, unitId: f.unitId, qtyInUnit: 1, unitPricePence: 5000 }] });
  await payments.recordCustomerPayment(f.businessId, credit.id, [{ method: 'CASH', amountPence: 1000 }], f.users.cashier1.id,
    { idempotencyKey: `native-recovery-debtor-${f.run}` });
  const purchase = await purchases.createPurchase({ businessId: f.businessId, storeId: store.id, supplierId: f.supplier.id,
    userId: f.users.owner.id, paymentStatus: 'UNPAID', payments: [], sourceDocuments: [purchaseDocumentFixture()],
    acknowledgeHighCost: true, idempotencyKey: `native-recovery-purchase-${f.run}`,
    lines: [{ productId: f.products[0].id, unitId: f.unitId, qtyInUnit: 1, unitCostPence: 12000 }] });
  await payments.recordSupplierPayment(f.businessId, purchase.id, [{ method: 'CASH', amountPence: 1200 }], {
    recordedByUserId: f.users.owner.id, actorRole: 'OWNER', actorName: 'Fictional owner', tillId: store.tillId,
    shiftId: store.shiftId, idempotencyKey: `native-recovery-supplier-${f.run}`,
  });
  const account = await prisma.account.findUniqueOrThrow({ where: { businessId_code: { businessId: f.businessId, code: '6000' } } });
  await expenses.createExpense({ businessId: f.businessId, storeId: store.id, userId: f.users.owner.id,
    accountId: account.id, amountPence: 3000, paymentStatus: 'PAID', method: 'CASH', amountPaidPence: 3000,
    tillId: store.tillId, shiftId: store.shiftId, idempotencyKey: `native-recovery-expense-${f.run}` });
  const ar = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: credit.id }, include: { payments: true } });
  const ap = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: purchase.id }, include: { payments: true } });
  expect(ar.totalPence - ar.payments.reduce((sum, p) => sum + p.amountPence, 0)).toBe(4000);
  expect(ap.totalPence - ap.payments.reduce((sum, p) => sum + p.amountPence, 0)).toBe(10800);
  const entries = await prisma.journalEntry.findMany({ where: { businessId: f.businessId }, include: { lines: true } });
  for (const entry of entries) expect(entry.lines.reduce((sum, line) => sum + line.debitPence - line.creditPence, 0)).toBe(0);
  // Deliberately retained only for the explicit disposable CI recovery drill.
  // The next step restores the entire database into a separately created database.
}, 60000);
