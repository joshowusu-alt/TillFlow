'use server';

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { withBusinessContext, requireSelectedStoreContext, safeAction, formAction, ok, UserError } from '@/lib/action-utils';
import { formString } from '@/lib/form-helpers';
import { revalidatePath, revalidateTag } from 'next/cache';
import { checkoutContextTag, revalidatePosCatalog } from '@/lib/cache/pos-tags';
import { MEDICINE_CLASSES, calendarDate, expiryDate, positiveQuantity } from '@/lib/pharmacy/policy';
import { approvePharmacyReview, requestPharmacyReview, pharmacyEnabled, pharmacyRules, lockPharmacyPolicy } from '@/lib/services/pharmacy';
import { lockInventoryValues } from '@/lib/services/shared/inventory-utils';
import { validatePurchaseDocuments } from '@/lib/purchases/source-documents';

async function pharmacyBusiness(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { businessCategory: true } });
  if (business?.businessCategory !== 'PHARMACY') throw new UserError('Choose Pharmacy as the business category before configuring dispensing.');
}

async function recordAudit(db: Prisma.TransactionClient, ctx: Awaited<ReturnType<typeof withBusinessContext>>, action: string, entityId: string, details: object) {
  await db.auditLog.create({ data: { businessId: ctx.businessId, userId: ctx.user.id, userName: ctx.user.name ?? 'Staff', userRole: ctx.user.role, action, entity: 'Pharmacy', entityId, details: JSON.stringify(details) } });
}

async function requirePharmacist(businessId: string, userId: string) {
  const person = await prisma.pharmacyPractitioner.findFirst({ where: { businessId, userId, active: true, registrationExpiresAt: { gt: new Date() } } });
  if (!person) throw new UserError('This action requires a separately authorised pharmacist with current recorded registration.');
}

export async function savePharmacyPractitionerAction(data: FormData) {
  await formAction(async () => {
    const ctx = await withBusinessContext(['OWNER']);
    await pharmacyBusiness(ctx.businessId);
    const userId = formString(data, 'userId');
    const staff = await prisma.user.findFirst({ where: { id: userId, businessId: ctx.businessId, active: true }, select: { id: true } });
    const number = formString(data, 'registrationNumber').trim();
    if (!staff || !number || number.length > 100) throw new UserError('Choose an active staff member and enter their professional registration number.');
    const values = { registrationNumber: number, registrationExpiresAt: expiryDate(formString(data, 'registrationExpiresAt')), active: data.get('active') === 'on', recordedByUserId: ctx.user.id };
    await prisma.$transaction(async db => {
      await lockPharmacyPolicy(db, ctx.businessId, true);
      const person = await db.pharmacyPractitioner.upsert({ where: { businessId_userId: { businessId: ctx.businessId, userId } }, create: { businessId: ctx.businessId, userId, ...values }, update: values });
      await recordAudit(db, ctx, 'PHARMACY_PRACTITIONER_RECORDED', person.id, { userId, active: values.active, registrationExpiresAt: values.registrationExpiresAt });
    });
    revalidatePath('/pharmacy');
    return ok();
  }, '/pharmacy?section=setup');
}

export async function setPharmacyEnabledAction(data: FormData) {
  await formAction(async () => {
    const ctx = await withBusinessContext(['OWNER']);
    await pharmacyBusiness(ctx.businessId);
    const enabled = data.get('enabled') === 'true';
    if (enabled && process.env.VERCEL_ENV === 'production') throw new UserError('Pharmacy dispensing is a preview pilot awaiting professional workflow review. Production activation is not available yet.');
    if (enabled && data.get('confirm') !== 'on') throw new UserError('Confirm the pharmacy pilot requirements before enabling dispensing checks.');
    if (enabled && !await prisma.pharmacyPractitioner.findFirst({ where: { businessId: ctx.businessId, active: true, registrationExpiresAt: { gt: new Date() }, userId: { in: (await prisma.user.findMany({ where: { businessId: ctx.businessId, active: true }, select: { id: true } })).map(user => user.id) } } })) throw new UserError('Record at least one active pharmacist with current registration first.');
    await prisma.$transaction(async db => {
      await db.pharmacySettings.upsert({ where: { businessId: ctx.businessId }, create: { businessId: ctx.businessId, enabled }, update: { enabled } });
      await recordAudit(db, ctx, 'PHARMACY_CHECKS_CHANGED', ctx.businessId, { enabled });
    });
    revalidateTag(checkoutContextTag(ctx.businessId));
    revalidatePath('/pharmacy'); revalidatePath('/pos');
    return ok();
  }, '/pharmacy?section=setup');
}

export async function savePharmacyProductAction(data: FormData) {
  await formAction(async () => {
    const ctx = await withBusinessContext(['OWNER', 'MANAGER']);
    await pharmacyBusiness(ctx.businessId);
    const productId = formString(data, 'productId');
    if (!await prisma.product.findFirst({ where: { id: productId, businessId: ctx.businessId, active: true }, select: { id: true } })) throw new UserError('Product not found.');
    const medicineClass = formString(data, 'medicineClass');
    if (!MEDICINE_CLASSES.includes(medicineClass as typeof MEDICINE_CLASSES[number])) throw new UserError('Choose a medicine classification.');
    const rawAge = formString(data, 'minimumPatientAge').trim();
    const minimumPatientAge = rawAge ? Number(rawAge) : null;
    if (minimumPatientAge !== null && (!Number.isInteger(minimumPatientAge) || minimumPatientAge < 0 || minimumPatientAge > 120)) throw new UserError('Enter a whole minimum patient age between 0 and 120, or leave it blank.');
    if (medicineClass === 'GENERAL' && (minimumPatientAge !== null || formString(data, 'checkInstructions').trim())) throw new UserError('Use a medicine classification when configuring dispensing checks.');
    await prisma.$transaction(async db => {
      await lockPharmacyPolicy(db, ctx.businessId, true);
      const before = await db.pharmacyProductRule.findUnique({ where: { productId } });
      const rule = await db.pharmacyProductRule.upsert({ where: { productId }, create: { businessId: ctx.businessId, productId, medicineClass, minimumPatientAge, checkInstructions: formString(data, 'checkInstructions').trim().slice(0, 1000) }, update: { medicineClass, minimumPatientAge, checkInstructions: formString(data, 'checkInstructions').trim().slice(0, 1000) } });
      if (medicineClass !== 'GENERAL') await db.product.updateMany({ where: { id: productId, businessId: ctx.businessId }, data: { storefrontPublished: false } });
      await recordAudit(db, ctx, 'PHARMACY_PRODUCT_POLICY_CHANGED', productId, { before, after: rule });
    });
    revalidatePosCatalog(ctx.businessId);
    revalidatePath('/pharmacy'); revalidatePath(`/products/${productId}`);
    return ok();
  }, data.get('returnToProduct') === 'true' ? `/products/${encodeURIComponent(formString(data, 'productId'))}` : `/pharmacy?section=products&productId=${encodeURIComponent(formString(data, 'productId'))}`);
}

export async function savePharmacyBatchAction(data: FormData) {
  await formAction(async () => {
    const ctx = await requireSelectedStoreContext(undefined, formString(data, 'storeId'));
    await pharmacyBusiness(ctx.businessId);
    await requirePharmacist(ctx.businessId, ctx.user.id);
    const productId = formString(data, 'productId');
    const batchNumber = formString(data, 'batchNumber').trim();
    const reason = formString(data, 'reason').trim();
    const qtyRemainingBase = Number(formString(data, 'qtyRemainingBase'));
    if (!batchNumber || batchNumber.length > 100 || !reason || reason.length > 500 || !Number.isSafeInteger(qtyRemainingBase) || qtyRemainingBase < 0) throw new UserError('Enter the physical batch number, non-negative whole quantity and reconciliation reason.');
    const expiresAt = expiryDate(formString(data, 'expiresAt'));
    await prisma.$transaction(async db => {
      await lockInventoryValues(db, ctx.storeId, [productId]);
      await lockPharmacyPolicy(db, ctx.businessId);
      const { rules } = await pharmacyRules(db, ctx.businessId, [productId]);
      if (rules[0].medicineClass === 'GENERAL') throw new UserError('Batch dispensing is for classified medicines.');
      const where = { businessId: ctx.businessId, storeId: ctx.storeId, productId, batchNumber };
      const before = await db.pharmacyBatch.findUnique({ where: { businessId_storeId_productId_batchNumber: where } });
      const batches = await db.pharmacyBatch.findMany({ where: { businessId: ctx.businessId, storeId: ctx.storeId, productId } });
      const stock = await db.inventoryBalance.findUnique({ where: { storeId_productId: { storeId: ctx.storeId, productId } } });
      const otherQty = batches.filter(batch => batch.id !== before?.id).reduce((sum, batch) => sum + batch.qtyRemainingBase, 0);
      if (otherQty + qtyRemainingBase > (stock?.qtyOnHandBase ?? 0)) throw new UserError('Batch quantities cannot exceed recorded stock. Receive stock through Purchases first.');
      const values = { expiresAt, qtyRemainingBase, quarantined: data.get('quarantined') === 'on' || expiresAt <= new Date(), recordedByUserId: ctx.user.id };
      const after = await db.pharmacyBatch.upsert({ where: { businessId_storeId_productId_batchNumber: where }, create: { ...where, ...values }, update: values });
      await recordAudit(db, ctx, 'PHARMACY_BATCH_RECONCILED', after.id, { before, after, reason });
    }, { maxWait: 10000, timeout: 30000 });
    revalidatePath('/pharmacy');
    return ok();
  }, `/pharmacy?section=batches&productId=${encodeURIComponent(formString(data, 'productId'))}`);
}

export async function recordPharmacyPrescriptionAction(data: FormData) {
  await formAction(async () => {
    const ctx = await withBusinessContext();
    await pharmacyBusiness(ctx.businessId);
    await requirePharmacist(ctx.businessId, ctx.user.id);
    const patientName = formString(data, 'patientName').trim();
    const prescriberName = formString(data, 'prescriberName').trim();
    const prescriberReference = formString(data, 'prescriberReference').trim();
    if (!patientName || patientName.length > 160 || !prescriberName || prescriberName.length > 160 || !prescriberReference || prescriberReference.length > 160) throw new UserError('Complete the patient and prescriber reference.');
    let parsed: { productId: string; authorisedQtyBase: number; directions: string }[];
    try {
      const lines = JSON.parse(formString(data, 'linesJson'));
      if (!Array.isArray(lines) || !lines.length || lines.length > 50) throw new Error();
      parsed = lines.map(line => {
        const productId = String(line.productId ?? '');
        const directions = String(line.directions ?? '').trim();
        if (!productId || !directions || directions.length > 1000) throw new Error();
        return { productId, directions, authorisedQtyBase: positiveQuantity(line.authorisedQtyBase) };
      });
      if (new Set(parsed.map(line => line.productId)).size !== parsed.length) throw new Error();
    } catch { throw new UserError('Add each prescribed medicine once, with a positive base-unit quantity and the written directions.'); }
    const patientDateOfBirth = calendarDate(formString(data, 'patientDateOfBirth'), 'patient date of birth');
    const issuedAt = calendarDate(formString(data, 'issuedAt'), 'prescription date');
    const validUntil = formString(data, 'validUntil') ? expiryDate(formString(data, 'validUntil')) : null;
    if (issuedAt > new Date() || patientDateOfBirth > new Date() || (validUntil && validUntil < issuedAt)) throw new UserError('Review the patient and prescription dates.');
    const file = data.get('document');
    if (!file || typeof file !== 'object' || !('arrayBuffer' in file) || file.size > 2 * 1024 * 1024) throw new UserError('Attach a prescription PDF or image up to 2 MB.');
    const [document] = validatePurchaseDocuments([{ name: file.name, contentType: file.type, body: new Uint8Array(await file.arrayBuffer()) }]);
    await prisma.$transaction(async db => {
      const { rules } = await pharmacyRules(db, ctx.businessId, parsed.map(line => line.productId));
      if (rules.some(rule => rule.medicineClass === 'GENERAL')) throw new UserError('Choose classified medicines for this prescription.');
      const rx = await db.pharmacyPrescription.create({ data: { businessId: ctx.businessId, patientName, patientDateOfBirth, prescriberName, prescriberReference, issuedAt, validUntil, documentName: document.originalFilename, documentContentType: document.contentType, documentBody: document.body, documentSha256: document.sha256, recordedByUserId: ctx.user.id, lines: { create: parsed } } });
      await recordAudit(db, ctx, 'PHARMACY_PRESCRIPTION_RECORDED', rx.id, { products: parsed.map(line => ({ productId: line.productId, authorisedQtyBase: line.authorisedQtyBase })) });
    });
    revalidatePath('/pharmacy');
    return ok();
  }, '/pharmacy?section=prescriptions');
}

export async function approvePharmacyReviewAction(data: FormData) {
  await formAction(async () => {
    const ctx = await withBusinessContext();
    const id = formString(data, 'reviewId');
    const review = await prisma.pharmacyReview.findFirst({ where: { id, businessId: ctx.businessId }, select: { storeId: true } });
    if (!review) throw new UserError('Review not found.');
    await requireSelectedStoreContext(undefined, review.storeId);
    if (data.get('confirmed') !== 'on') throw new UserError('Confirm that you reviewed the prescription, patient and medicine checks.');
    await approvePharmacyReview(ctx.businessId, id, ctx.user.id);
    revalidatePath('/pharmacy');
    return ok();
  }, '/pharmacy?section=reviews');
}

export async function cancelPharmacyPrescriptionAction(data: FormData) {
  await formAction(async () => {
    const ctx = await withBusinessContext();
    await requirePharmacist(ctx.businessId, ctx.user.id);
    const reason = formString(data, 'reason').trim();
    if (!reason || reason.length > 500) throw new UserError('Enter a cancellation reason.');
    await prisma.$transaction(async db => {
      await lockPharmacyPolicy(db, ctx.businessId, true);
      const changed = await db.pharmacyPrescription.updateMany({ where: { id: formString(data, 'prescriptionId'), businessId: ctx.businessId, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
      if (changed.count !== 1) throw new UserError('Active prescription not found.');
      await recordAudit(db, ctx, 'PHARMACY_PRESCRIPTION_CANCELLED', formString(data, 'prescriptionId'), { reason });
    });
    revalidatePath('/pharmacy'); return ok();
  }, '/pharmacy?section=prescriptions');
}

export async function declinePharmacyReviewAction(data: FormData) {
  await formAction(async () => {
    const ctx = await withBusinessContext();
    await requirePharmacist(ctx.businessId, ctx.user.id);
    const id = formString(data, 'reviewId');
    const review = await prisma.pharmacyReview.findFirst({ where: { id, businessId: ctx.businessId }, select: { storeId: true } });
    if (!review) throw new UserError('Pending review not found.');
    await requireSelectedStoreContext(undefined, review.storeId);
    await prisma.$transaction(async db => {
      await lockPharmacyPolicy(db, ctx.businessId);
      const changed = await db.pharmacyReview.updateMany({ where: { id, businessId: ctx.businessId, status: 'PENDING' }, data: { status: 'DECLINED', pharmacistUserId: ctx.user.id } });
      if (changed.count !== 1) throw new UserError('Pending review not found.');
      await recordAudit(db, ctx, 'PHARMACY_REVIEW_DECLINED', id, {});
    });
    revalidatePath('/pharmacy'); return ok();
  }, '/pharmacy?section=reviews');
}

export async function pharmacyCartStatusAction(input: { storeId: string; productIds: string[]; reviewId?: string }) {
  return safeAction(async () => {
    const ctx = await requireSelectedStoreContext(undefined, input.storeId, { requireWrite: false });
    if (!await pharmacyEnabled(prisma, ctx.businessId)) return ok({ enabled: false, rules: [], review: null });
    const rules = await prisma.pharmacyProductRule.findMany({ where: { businessId: ctx.businessId, productId: { in: input.productIds.slice(0, 100) } } });
    const products = await prisma.product.findMany({ where: { businessId: ctx.businessId, id: { in: rules.map(rule => rule.productId) } }, select: { id: true, name: true } });
    const review = input.reviewId ? await prisma.pharmacyReview.findFirst({ where: { id: input.reviewId, businessId: ctx.businessId, storeId: ctx.storeId, cashierUserId: ctx.user.id }, select: { id: true, status: true, expiresAt: true, allocations: true } }) : null;
    const ids = review?.allocations.map(row => row.batchId) ?? [];
    const batches = ids.length ? await prisma.pharmacyBatch.findMany({ where: { businessId: ctx.businessId, storeId: ctx.storeId, id: { in: ids } }, select: { id: true, productId: true, batchNumber: true, expiresAt: true } }) : [];
    return ok({ enabled: true, rules: rules.map(rule => ({ productId: rule.productId, productName: products.find(product => product.id === rule.productId)?.name ?? 'Medicine', medicineClass: rule.medicineClass, minimumPatientAge: rule.minimumPatientAge, checkInstructions: rule.checkInstructions })), review: review ? { id: review.id, status: review.status, expiresAt: review.expiresAt?.toISOString(), batches: review.allocations.map(row => ({ ...row, productName: products.find(product => product.id === row.productId)?.name ?? 'Medicine', batch: batches.find(batch => batch.id === row.batchId) })) } : null });
  });
}

export async function requestPharmacyReviewAction(input: Omit<Parameters<typeof requestPharmacyReview>[0], 'businessId' | 'cashierUserId'>) {
  return safeAction(async () => {
    const ctx = await requireSelectedStoreContext(undefined, input.storeId);
    return ok(await requestPharmacyReview({ ...input, businessId: ctx.businessId, cashierUserId: ctx.user.id }));
  });
}
