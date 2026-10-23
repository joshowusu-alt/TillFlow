import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { UserError } from '@/lib/action-utils';
import { lockInventoryValues } from './shared/inventory-utils';
import { calendarDate, chooseEligibleBatches, pharmacyCartHash, positiveQuantity, validatePatient, type PharmacyQuantity, type PharmacyRule } from '@/lib/pharmacy/policy';
import { isPostgresRuntimeEnv } from '@/lib/database-runtime';

type Db = Prisma.TransactionClient;
const transactionOptions = { maxWait: 10000, timeout: 30000 };

async function dispensingAudit(db: Db, businessId: string, userId: string, action: string, entityId: string, details: object) {
  const actor = await db.user.findFirstOrThrow({ where: { id: userId, businessId }, select: { name: true, role: true } });
  await db.auditLog.create({ data: { businessId, userId, userName: actor.name, userRole: actor.role, action, entity: 'PharmacyReview', entityId, details: JSON.stringify(details) } });
}

export async function pharmacyEnabled(db: Db, businessId: string) {
  return Boolean((await db.pharmacySettings.findUnique({ where: { businessId } }))?.enabled);
}

export async function lockPharmacyPolicy(db: Db, businessId: string, write = false) {
  if (isPostgresRuntimeEnv()) {
    if (write) await db.$queryRaw`SELECT "businessId" FROM "PharmacySettings" WHERE "businessId"=${businessId} FOR UPDATE`;
    else await db.$queryRaw`SELECT "businessId" FROM "PharmacySettings" WHERE "businessId"=${businessId} FOR SHARE`;
  }
}

export async function pharmacyRules(db: Db, businessId: string, productIds: string[]) {
  const ids = [...new Set(productIds)].sort();
  const [products, rules] = await Promise.all([
    db.product.findMany({ where: { businessId, id: { in: ids }, active: true }, select: { id: true, name: true } }),
    db.pharmacyProductRule.findMany({ where: { businessId, productId: { in: ids } } }),
  ]);
  if (products.length !== ids.length) throw new UserError('One or more products are unavailable in this business.');
  if (rules.length !== ids.length) throw new UserError('Classify every product in this cart in Pharmacy before selling. Choose General goods for non-medicines.');
  if (rules.some(rule => !['GENERAL', 'OTC', 'PHARMACIST', 'PRESCRIPTION'].includes(rule.medicineClass) || (rule.minimumPatientAge !== null && (!Number.isInteger(rule.minimumPatientAge) || rule.minimumPatientAge < 0 || rule.minimumPatientAge > 120)))) throw new UserError('A medicine rule is invalid. Review its classification in Pharmacy.');
  return { products, rules };
}

export async function assertPharmacyChannel(db: Db, businessId: string, productIds: string[], channel: string) {
  if (!await pharmacyEnabled(db, businessId)) return;
  const { rules } = await pharmacyRules(db, businessId, productIds);
  if (channel !== 'POS' && rules.some(rule => rule.medicineClass !== 'GENERAL')) {
    throw new UserError('Medicine dispensing requires an online POS batch check. Offline, storefront and amendment dispensing are unavailable in this pharmacy pilot.');
  }
}

async function practitioner(db: Db, businessId: string, userId: string, now: Date) {
  const registered = await db.pharmacyPractitioner.findFirst({ where: { businessId, userId, active: true, registrationExpiresAt: { gt: now } } });
  const staff = await db.user.findFirst({ where: { businessId, id: userId, active: true }, select: { id: true } });
  if (!registered || !staff) throw new UserError('Approval requires a separately authorised pharmacist with current recorded registration.');
  return registered;
}

function medicineQuantities(quantities: PharmacyQuantity[], rules: PharmacyRule[]) {
  const ids = new Set(rules.filter(rule => rule.medicineClass !== 'GENERAL').map(rule => rule.productId));
  return quantities.filter(line => ids.has(line.productId));
}

async function batchPlan(db: Db, businessId: string, storeId: string, quantities: PharmacyQuantity[], now: Date, inventoryBefore?: ReadonlyMap<string, { qtyOnHandBase: number }>) {
  const ids = quantities.map(line => line.productId);
  const batches = await db.pharmacyBatch.findMany({ where: { businessId, storeId, productId: { in: ids } } });
  const balances = inventoryBefore ?? new Map((await db.inventoryBalance.findMany({ where: { storeId, productId: { in: ids } }, select: { productId: true, qtyOnHandBase: true } })).map(row => [row.productId, row]));
  for (const id of ids) {
    const allocated = batches.filter(batch => batch.productId === id).reduce((sum, batch) => sum + batch.qtyRemainingBase, 0);
    if (allocated !== (balances.get(id)?.qtyOnHandBase ?? 0)) throw new UserError('Batch quantities do not match stock. Reconcile the physical batches in Pharmacy before dispensing.');
  }
  return { batches, allocations: chooseEligibleBatches(batches, quantities, now) };
}

async function validatePrescription(db: Db, review: { businessId: string; prescriptionId: string | null; patientName: string; patientDateOfBirth: Date | null }, quantities: PharmacyQuantity[], rules: PharmacyRule[], now: Date, consume: boolean) {
  const requiredIds = new Set(rules.filter(rule => rule.medicineClass === 'PRESCRIPTION').map(rule => rule.productId));
  if (!requiredIds.size) return;
  const rx = review.prescriptionId ? await db.pharmacyPrescription.findFirst({ where: { id: review.prescriptionId, businessId: review.businessId, status: 'ACTIVE' }, include: { lines: true } }) : null;
  if (!rx || rx.issuedAt > now || (rx.validUntil && rx.validUntil < now)) throw new UserError('Select an active prescription whose dates permit this dispensing.');
  if (rx.patientName.trim().toLocaleLowerCase() !== review.patientName.trim().toLocaleLowerCase() || rx.patientDateOfBirth.getTime() !== review.patientDateOfBirth?.getTime()) throw new UserError('The prescription patient must match the patient being supplied.');
  for (const requested of quantities.filter(line => requiredIds.has(line.productId))) {
    const line = rx.lines.find(item => item.productId === requested.productId);
    if (!line || requested.qtyBase > line.authorisedQtyBase - line.dispensedQtyBase) throw new UserError('This quantity exceeds the prescription’s remaining authorised quantity.');
    if (consume) {
      const changed = await db.pharmacyPrescriptionLine.updateMany({ where: { id: line.id, dispensedQtyBase: { lte: line.authorisedQtyBase - requested.qtyBase }, prescription: { businessId: review.businessId, status: 'ACTIVE' } }, data: { dispensedQtyBase: { increment: requested.qtyBase } } });
      if (changed.count !== 1) throw new UserError('Prescription quantity changed. Request a new pharmacist review.');
    }
  }
}

async function approveReviewTx(db: Db, id: string, businessId: string, approvedBy: string, professional: boolean) {
  const review = await db.pharmacyReview.findFirst({ where: { id, businessId, status: 'PENDING' } });
  if (!review) throw new UserError('This review is no longer pending.');
  const quantities = JSON.parse(review.cartJson) as PharmacyQuantity[];
  await lockInventoryValues(db, review.storeId, quantities.map(line => line.productId));
  await lockPharmacyPolicy(db, businessId);
  if (!await pharmacyEnabled(db, businessId)) throw new UserError('Pharmacy dispensing is not enabled.');
  const { rules } = await pharmacyRules(db, businessId, quantities.map(line => line.productId));
  const now = new Date();
  const professionalRequired = rules.some(rule => ['PHARMACIST', 'PRESCRIPTION'].includes(rule.medicineClass) || Boolean(rule.checkInstructions.trim()));
  if (professionalRequired && !professional) throw new UserError('A pharmacist must complete this review.');
  if (professional) await practitioner(db, businessId, approvedBy, now);
  validatePatient(rules, review.patientName, review.patientDateOfBirth, review.ageCheckConfirmed, now);
  await validatePrescription(db, review, quantities, rules, now, false);
  const { batches, allocations } = await batchPlan(db, businessId, review.storeId, medicineQuantities(quantities, rules), now);
  const changed = await db.pharmacyReview.updateMany({ where: { id, businessId, status: 'PENDING' }, data: { status: 'APPROVED', pharmacistUserId: professional ? approvedBy : null, approvedAt: now, expiresAt: new Date(now.getTime() + 10 * 60_000), cartHash: pharmacyCartHash(quantities, rules) } });
  if (changed.count !== 1) throw new UserError('Review changed. Refresh the pharmacy queue.');
  await db.pharmacyDispenseAllocation.createMany({ data: allocations.map(allocation => ({ reviewId: id, ...allocation, batchNumber: batches.find(batch => batch.id === allocation.batchId)!.batchNumber, expiresAt: batches.find(batch => batch.id === allocation.batchId)!.expiresAt })) });
  await dispensingAudit(db, businessId, approvedBy, 'PHARMACY_REVIEW_APPROVED', id, { professional, batchCount: allocations.length });
  return { id, status: 'APPROVED' };
}

export async function requestPharmacyReview(input: { businessId: string; storeId: string; cashierUserId: string; checkoutRef: string; lines: { productId: string; unitId: string; qtyInUnit: number; qtyBase?: number }[]; patientName: string; patientDateOfBirth: string; prescriptionId?: string; ageCheckConfirmed: boolean }) {
  if (!input.checkoutRef.startsWith('POS_ONLINE:') || input.checkoutRef.length > 200 || !input.lines.length || input.lines.length > 100) throw new UserError('Start a valid online POS cart before requesting review.');
  const units = await prisma.productUnit.findMany({ where: { product: { businessId: input.businessId }, OR: input.lines.map(line => ({ productId: line.productId, unitId: line.unitId })) }, select: { productId: true, unitId: true, conversionToBase: true } });
  const totals = new Map<string, number>();
  for (const line of input.lines) {
    const unit = units.find(item => item.productId === line.productId && item.unitId === line.unitId);
    if (!unit) throw new UserError('A product unit is unavailable.');
    const qtyBase = positiveQuantity(positiveQuantity(line.qtyInUnit) * unit.conversionToBase);
    if (line.qtyBase !== undefined && line.qtyBase !== qtyBase) throw new UserError('Medicine quantities must use configured product units.');
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + qtyBase);
  }
  const quantities = [...totals].map(([productId, qtyBase]) => ({ productId, qtyBase }));
  return prisma.$transaction(async db => {
    await lockPharmacyPolicy(db, input.businessId);
    if (!await pharmacyEnabled(db, input.businessId)) throw new UserError('Pharmacy dispensing is not enabled.');
    const { rules } = await pharmacyRules(db, input.businessId, [...totals.keys()]);
    const identityNeeded = rules.some(rule => rule.medicineClass === 'PRESCRIPTION' || rule.minimumPatientAge !== null);
    const patientName = identityNeeded ? input.patientName.trim() : '';
    if (patientName.length > 160) throw new UserError('Patient name must be no longer than 160 characters.');
    const birth = identityNeeded && input.patientDateOfBirth ? calendarDate(input.patientDateOfBirth, 'patient date of birth') : null;
    validatePatient(rules, patientName, birth, input.ageCheckConfirmed);
    await db.pharmacyReview.updateMany({ where: { businessId: input.businessId, storeId: input.storeId, cashierUserId: input.cashierUserId, checkoutRef: input.checkoutRef, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'SUPERSEDED' } });
    const review = await db.pharmacyReview.create({ data: { businessId: input.businessId, storeId: input.storeId, cashierUserId: input.cashierUserId, checkoutRef: input.checkoutRef, cartJson: JSON.stringify(quantities), cartHash: pharmacyCartHash(quantities, rules), patientName, patientDateOfBirth: birth, ageCheckConfirmed: input.ageCheckConfirmed, prescriptionId: rules.some(rule => rule.medicineClass === 'PRESCRIPTION') ? input.prescriptionId?.trim() || null : null } });
    const needsProfessional = rules.some(rule => ['PHARMACIST', 'PRESCRIPTION'].includes(rule.medicineClass) || Boolean(rule.checkInstructions.trim()));
    return { id: review.id, status: needsProfessional ? 'PENDING' : 'OTC_CHECK' };
  }, transactionOptions).then(async result => result.status === 'OTC_CHECK' ? prisma.$transaction(db => approveReviewTx(db, result.id, input.businessId, input.cashierUserId, false), transactionOptions) : result);
}

export async function approvePharmacyReview(businessId: string, reviewId: string, pharmacistUserId: string) {
  return prisma.$transaction(db => approveReviewTx(db, reviewId, businessId, pharmacistUserId, true), transactionOptions);
}

/** Runs inside the sale transaction, after normal stock locks and writes. */
export async function consumePharmacyReviewTx(db: Db, input: { businessId: string; storeId: string; cashierUserId: string; externalRef?: string | null; pharmacyReviewId?: string | null; pharmacyBatchesConfirmed?: boolean; saleSource?: string; skipInventoryMovements?: boolean }, quantities: PharmacyQuantity[], invoiceId: string, inventoryBefore: ReadonlyMap<string, { qtyOnHandBase: number }>) {
  await lockPharmacyPolicy(db, input.businessId);
  if (!await pharmacyEnabled(db, input.businessId)) return;
  const { rules } = await pharmacyRules(db, input.businessId, quantities.map(line => line.productId));
  const medicines = medicineQuantities(quantities, rules);
  if (!medicines.length) return;
  if (input.skipInventoryMovements || !input.pharmacyBatchesConfirmed) throw new UserError('Confirm the physical medicine batches before completing the sale.');
  if (input.saleSource && input.saleSource !== 'POS') throw new UserError('Medicine dispensing requires online POS review.');
  const now = new Date();
  const review = input.pharmacyReviewId ? await db.pharmacyReview.findFirst({ where: { id: input.pharmacyReviewId, businessId: input.businessId, storeId: input.storeId, cashierUserId: input.cashierUserId, checkoutRef: input.externalRef ?? '', status: 'APPROVED', expiresAt: { gt: now } }, include: { allocations: true } }) : null;
  if (!review || review.cartHash !== pharmacyCartHash(quantities, rules)) throw new UserError('Complete the pharmacy batch and dispensing checks for this exact cart before selling.');
  if (rules.some(rule => ['PHARMACIST', 'PRESCRIPTION'].includes(rule.medicineClass) || Boolean(rule.checkInstructions.trim()))) {
    if (!review.pharmacistUserId) throw new UserError('Pharmacist approval is required.');
    await practitioner(db, input.businessId, review.pharmacistUserId, now);
  }
  validatePatient(rules, review.patientName, review.patientDateOfBirth, review.ageCheckConfirmed, now);
  await batchPlan(db, input.businessId, input.storeId, medicines, now, inventoryBefore);
  const claim = await db.pharmacyReview.updateMany({ where: { id: review.id, status: 'APPROVED', salesInvoiceId: null, expiresAt: { gt: now } }, data: { status: 'DISPENSED', salesInvoiceId: invoiceId } });
  if (claim.count !== 1) throw new UserError('This dispensing review has already been used.');
  await validatePrescription(db, review, quantities, rules, now, true);
  const totals = new Map<string, number>();
  for (const allocation of review.allocations) {
    totals.set(allocation.productId, (totals.get(allocation.productId) ?? 0) + allocation.qtyBase);
    if (allocation.expiresAt <= now) throw new UserError('An approved batch has expired. Request a new review.');
    const changed = await db.pharmacyBatch.updateMany({ where: { id: allocation.batchId, businessId: input.businessId, storeId: input.storeId, productId: allocation.productId, batchNumber: allocation.batchNumber, quarantined: false, expiresAt: allocation.expiresAt, qtyRemainingBase: { gte: allocation.qtyBase } }, data: { qtyRemainingBase: { decrement: allocation.qtyBase } } });
    if (changed.count !== 1) throw new UserError('An approved batch changed, expired or was quarantined. Request a new review.');
  }
  if (totals.size !== medicines.length || medicines.some(line => totals.get(line.productId) !== line.qtyBase)) throw new UserError('Batch allocations do not match this dispensing.');
  await dispensingAudit(db, input.businessId, input.cashierUserId, 'PHARMACY_DISPENSED', review.id, { invoiceId, pharmacistUserId: review.pharmacistUserId });
}
