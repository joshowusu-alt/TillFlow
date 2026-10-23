import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';

vi.mock('@/lib/action-utils', () => ({ UserError: class UserError extends Error {} }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('./risk-monitor', () => ({ detectExcessiveDiscountRisk: vi.fn().mockResolvedValue(undefined), detectNegativeMarginRisk: vi.fn().mockResolvedValue(undefined) }));

const describePg = canRunLivePostgresTests() ? describe : describe.skip;
describePg('pharmacy dispensing against an isolated Postgres database', () => {
  let db: PrismaClient;
  let pharmacy: typeof import('./pharmacy');
  let sales: typeof import('./sales');
  let businessId: string, storeId: string, tillId: string, unitId: string, cashierId: string, pharmacistId: string;
  beforeAll(async () => {
    ({ prisma: db } = await openTestPrismaClient());
    pharmacy = await import('./pharmacy');
    sales = await import('./sales');
    businessId = (await db.business.create({ data: { name: 'Synthetic pharmacy pilot', businessCategory: 'PHARMACY' } })).id;
    storeId = (await db.store.create({ data: { businessId, name: 'Synthetic branch' } })).id;
    cashierId = (await db.user.create({ data: { businessId, name: 'Owner without pharmacy authority', role: 'OWNER', email: `pharmacy-owner-${businessId}@example.invalid`, passwordHash: 'fixture' } })).id;
    pharmacistId = (await db.user.create({ data: { businessId, name: 'Synthetic pharmacist', role: 'CASHIER', email: `pharmacy-professional-${businessId}@example.invalid`, passwordHash: 'fixture' } })).id;
    tillId = (await db.till.create({ data: { storeId, name: 'Synthetic till' } })).id;
    await db.shift.create({ data: { tillId, userId: cashierId, status: 'OPEN', openKey: tillId } });
    unitId = (await db.unit.create({ data: { name: `Pharmacy unit ${businessId}`, pluralName: 'Units' } })).id;
    await db.pharmacySettings.create({ data: { businessId, enabled: true } });
    await db.pharmacyPractitioner.create({ data: { businessId, userId: pharmacistId, recordedByUserId: cashierId, registrationNumber: 'SYNTHETIC-NOT-A-REGISTRATION', registrationExpiresAt: new Date('2099-12-31') } });
    const { ensureChartOfAccounts } = await import('@/lib/accounting');
    await ensureChartOfAccounts(businessId, db);
  }, 90000);

  afterAll(async () => {
    if (!db || !businessId) return;
    await runTestTeardown(db, [
      () => db.pharmacyDispenseAllocation.deleteMany({ where: { review: { businessId } } }),
      () => db.pharmacyReview.deleteMany({ where: { businessId } }),
      () => db.pharmacyPrescriptionLine.deleteMany({ where: { prescription: { businessId } } }),
      () => db.pharmacyPrescription.deleteMany({ where: { businessId } }),
      () => db.pharmacyBatch.deleteMany({ where: { businessId } }),
      () => db.pharmacyProductRule.deleteMany({ where: { businessId } }),
      () => db.pharmacyPractitioner.deleteMany({ where: { businessId } }),
      () => db.pharmacySettings.deleteMany({ where: { businessId } }),
      () => db.auditLog.deleteMany({ where: { businessId } }),
      () => db.salesInvoice.deleteMany({ where: { businessId } }),
      () => db.cashDrawerEntry.deleteMany({ where: { businessId } }),
      () => db.moneyIdempotency.deleteMany({ where: { businessId } }),
      () => db.stockMovement.deleteMany({ where: { store: { businessId } } }),
      () => db.inventoryBalance.deleteMany({ where: { store: { businessId } } }),
      () => db.journalEntry.deleteMany({ where: { businessId } }),
      () => db.product.deleteMany({ where: { businessId } }),
      () => db.unit.deleteMany({ where: { id: unitId } }),
      () => db.businessSequence.deleteMany({ where: { businessId } }),
      () => db.account.deleteMany({ where: { businessId } }),
      () => db.shift.deleteMany({ where: { tillId } }),
      () => db.till.deleteMany({ where: { storeId } }),
      () => db.store.deleteMany({ where: { businessId } }),
      () => db.user.deleteMany({ where: { businessId } }),
      () => db.business.deleteMany({ where: { id: businessId } }),
    ]);
    const { prisma } = await import('@/lib/prisma');
    await prisma.$disconnect();
  }, 90000);

  async function fixture(authorisedQtyBase = 3, medicineClass = 'PRESCRIPTION') {
    const product = await db.product.create({ data: { businessId, name: `Synthetic medicine ${crypto.randomUUID()}`, sellingPriceBasePence: 1000, defaultCostBasePence: 500, productUnits: { create: { unitId, conversionToBase: 1, isBaseUnit: true } } } });
    await db.inventoryBalance.create({ data: { storeId, productId: product.id, qtyOnHandBase: 10, avgCostBasePence: 500, knownValuePence: 5000, unvaluedQtyBase: 0 } });
    await db.pharmacyProductRule.create({ data: { businessId, productId: product.id, medicineClass, minimumPatientAge: medicineClass === 'PRESCRIPTION' ? 18 : null } });
    const batch = await db.pharmacyBatch.create({ data: { businessId, storeId, productId: product.id, batchNumber: 'SYNTHETIC-BATCH', expiresAt: new Date('2099-12-31'), qtyRemainingBase: 10, recordedByUserId: pharmacistId } });
    const rx = await db.pharmacyPrescription.create({ data: { businessId, patientName: 'Synthetic Patient', patientDateOfBirth: new Date('1990-01-01'), prescriberName: 'Synthetic Prescriber', prescriberReference: 'TEST ONLY', issuedAt: new Date('2020-01-01'), documentName: 'synthetic.pdf', documentContentType: 'application/pdf', documentBody: Buffer.from('%PDF-1.4 synthetic'), documentSha256: 'synthetic', recordedByUserId: pharmacistId, lines: { create: { productId: product.id, authorisedQtyBase, directions: 'Synthetic test directions only' } } } });
    return { productId: product.id, batchId: batch.id, prescriptionId: rx.id };
  }
  async function request(f: Awaited<ReturnType<typeof fixture>>, qty = 1, checkoutRef = `POS_ONLINE:${crypto.randomUUID()}`) {
    const review = await pharmacy.requestPharmacyReview({ businessId, storeId, cashierUserId: cashierId, checkoutRef, lines: [{ productId: f.productId, unitId, qtyInUnit: qty }], patientName: 'Synthetic Patient', patientDateOfBirth: '1990-01-01', prescriptionId: f.prescriptionId, ageCheckConfirmed: true });
    return { ...review, checkoutRef };
  }
  async function approved(f: Awaited<ReturnType<typeof fixture>>, qty = 1) {
    const review = await request(f, qty);
    if (review.status !== 'APPROVED') await pharmacy.approvePharmacyReview(businessId, review.id, pharmacistId);
    return review;
  }
  const sell = (f: Awaited<ReturnType<typeof fixture>>, review: { id: string; checkoutRef: string }, qty = 1, extra = {}) => sales.createSale({ businessId, storeId, tillId, cashierUserId: cashierId, paymentStatus: 'PAID', payments: [{ method: 'TRANSFER', amountPence: qty * 1000 }], lines: [{ productId: f.productId, unitId, qtyInUnit: qty }], externalRef: review.checkoutRef, pharmacyReviewId: review.id, pharmacyBatchesConfirmed: true, ...extra });
  async function snapshot(f: Awaited<ReturnType<typeof fixture>>) {
    return {
      inventory: await db.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId: f.productId } } }),
      batch: await db.pharmacyBatch.findUniqueOrThrow({ where: { id: f.batchId } }),
      rx: await db.pharmacyPrescriptionLine.findFirstOrThrow({ where: { prescriptionId: f.prescriptionId } }),
      invoices: await db.salesInvoice.count({ where: { businessId } }),
      journals: await db.journalEntry.count({ where: { businessId } }),
      movements: await db.stockMovement.count({ where: { storeId, productId: f.productId } }),
    };
  }

  it('dispenses exactly once, consumes prescription and batch quantities, and balances accounting', async () => {
    const f = await fixture(); const review = await approved(f, 2);
    const invoice = await sell(f, review, 2);
    expect((await sell(f, review, 2)).id).toBe(invoice.id);
    const state = await snapshot(f);
    expect(state.inventory.qtyOnHandBase).toBe(8);
    expect(state.batch.qtyRemainingBase).toBe(8);
    expect(state.rx.dispensedQtyBase).toBe(2);
    expect(await db.pharmacyReview.findUnique({ where: { id: review.id } })).toMatchObject({ status: 'DISPENSED', salesInvoiceId: invoice.id });
    const entries = await db.journalEntry.findMany({ where: { businessId, referenceId: invoice.id }, include: { lines: true } });
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach(entry => expect(entry.lines.reduce((sum, line) => sum + line.debitPence - line.creditPence, 0)).toBe(0));
  }, 60000);

  it.each(['quantity', 'policy', 'expiry', 'quarantine', 'prescription', 'approval', 'physical confirmation'] as const)('rolls back all money, stock and prescription changes after invalid %s', async change => {
    const f = await fixture(); const review = await approved(f);
    if (change === 'policy') await db.pharmacyProductRule.update({ where: { productId: f.productId }, data: { checkInstructions: 'New check' } });
    if (change === 'expiry') await db.pharmacyBatch.update({ where: { id: f.batchId }, data: { expiresAt: new Date('2000-01-01') } });
    if (change === 'quarantine') await db.pharmacyBatch.update({ where: { id: f.batchId }, data: { quarantined: true } });
    if (change === 'prescription') await db.pharmacyPrescription.update({ where: { id: f.prescriptionId }, data: { status: 'CANCELLED' } });
    if (change === 'approval') await db.pharmacyReview.update({ where: { id: review.id }, data: { expiresAt: new Date('2000-01-01') } });
    const before = await snapshot(f);
    await expect(sell(f, review, change === 'quantity' ? 2 : 1, change === 'physical confirmation' ? { pharmacyBatchesConfirmed: false } : {})).rejects.toThrow();
    expect(await snapshot(f)).toEqual(before);
    expect((await db.pharmacyReview.findUniqueOrThrow({ where: { id: review.id } })).status).toBe('APPROVED');
  }, 60000);

  it('does not treat the owner role as pharmacist registration', async () => {
    const f = await fixture(); const review = await request(f);
    await expect(pharmacy.approvePharmacyReview(businessId, review.id, cashierId)).rejects.toThrow('separately authorised');
    await expect(pharmacy.approvePharmacyReview('another-business', review.id, pharmacistId)).rejects.toThrow();
  }, 60000);

  it('rejects revoked professional authority even after approval', async () => {
    const f = await fixture(); const review = await approved(f);
    await db.pharmacyPractitioner.update({ where: { businessId_userId: { businessId, userId: pharmacistId } }, data: { active: false } });
    try { const before = await snapshot(f); await expect(sell(f, review)).rejects.toThrow('separately authorised'); expect(await snapshot(f)).toEqual(before); }
    finally { await db.pharmacyPractitioner.update({ where: { businessId_userId: { businessId, userId: pharmacistId } }, data: { active: true } }); }
  }, 60000);

  it('never overdispenses a prescription when two approved carts race', async () => {
    const f = await fixture(1); const a = await approved(f); const b = await approved(f);
    const results = await Promise.allSettled([sell(f, a), sell(f, b)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const state = await snapshot(f);
    expect(state.rx.dispensedQtyBase).toBe(1);
    expect(state.batch.qtyRemainingBase).toBe(9);
    expect(state.inventory.qtyOnHandBase).toBe(9);
  }, 60000);

  it('supersedes an older approval for the same checkout identity', async () => {
    const f = await fixture(); const old = await approved(f);
    await request(f, 1, old.checkoutRef);
    expect((await db.pharmacyReview.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('SUPERSEDED');
    await expect(sell(f, old)).rejects.toThrow();
  }, 60000);

  it.each(['OFFLINE', 'ONLINE_ORDER', 'AMENDMENT'])('blocks medicine via unsupported %s channels before dispensing', async channel => {
    const f = await fixture(); const before = await snapshot(f);
    await expect(pharmacy.assertPharmacyChannel(db, businessId, [f.productId], channel)).rejects.toThrow('online POS batch check');
    expect(await snapshot(f)).toEqual(before);
  }, 60000);

  it('allows OTC batch checks without a pharmacist prescription approval', async () => {
    const f = await fixture(3, 'OTC');
    const review = await pharmacy.requestPharmacyReview({ businessId, storeId, cashierUserId: cashierId, checkoutRef: `POS_ONLINE:${crypto.randomUUID()}`, lines: [{ productId: f.productId, unitId, qtyInUnit: 1 }], patientName: 'Unneeded prior patient', patientDateOfBirth: '1990-01-01', prescriptionId: f.prescriptionId, ageCheckConfirmed: false });
    expect(review.status).toBe('APPROVED');
    expect(await db.pharmacyReview.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ patientName: '', patientDateOfBirth: null, prescriptionId: null });
  }, 60000);
});
