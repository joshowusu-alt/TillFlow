'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath, revalidateTag } from 'next/cache';
import { formString, toPence } from '@/lib/form-helpers';
import { withBusinessContext, requireSelectedStoreContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { resolveStoreFromTill, STORE_MISMATCH_MSG, MISSING_STORE_CONTEXT_MSG } from '@/lib/reliability/selected-store';
import { audit } from '@/lib/audit';
import { verifyManagerPin } from '@/lib/security/pin';
import { recordCashDrawerEntryTx, summarizeCashDrawerEntries } from '@/lib/services/cash-drawer';
import {
  assertNonNegativeActualCash,
  NEGATIVE_ACTUAL_CASH_MSG,
  performShiftClose,
  performShiftOpen,
  TILL_ALREADY_OPEN_MSG,
} from '@/lib/services/shifts';
import {
  approveCashVariance,
  assignCashVarianceReviewer,
  explainCashVariance,
  resolveCashVariance,
} from '@/lib/services/cash-variance';
import { sendCashVarianceAlert } from '@/app/actions/stock-alerts';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS, appLog } from '@/lib/observability';
import { revalidatePosTillShiftTags } from '@/lib/cache/pos-tags';

const ADD_CASH_REASON_LABELS: Record<string, string> = {
  SAFE: 'Cash from safe / cash box',
  OWNER: 'Owner cash injection',
  MANAGER: 'Manager top-up',
  OTHER: 'Other',
};

export async function addCashToTillAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const amountRaw = formData.get('amount');
    const shiftId = formString(formData, 'shiftId');
    const requestedStoreId = formString(formData, 'storeId');
    const reasonCode = formString(formData, 'reasonCode');
    const note = formString(formData, 'note') || null;

    if (!amountRaw) return err('Amount is required.');
    const amountPence = toPence(amountRaw);
    if (amountPence <= 0) return err('Amount must be greater than zero.');
    if (!reasonCode) return err('A reason is required.');
    if (reasonCode === 'OTHER' && !note?.trim()) return err('Please describe the reason for adding cash.');
    if (!shiftId) return err('Open shift is required before adding cash to till.');

    const openShift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        status: 'OPEN',
        userId: user.id,
        till: { store: { businessId } },
      },
      select: { id: true, tillId: true, till: { select: { storeId: true } } },
    });
    if (!openShift) return err('Open shift is required before adding cash to till.');
    if (requestedStoreId && requestedStoreId !== openShift.till.storeId) {
      return err(STORE_MISMATCH_MSG);
    }
    const storeId = openShift.till.storeId;
    await requireSelectedStoreContext(['MANAGER', 'OWNER'], storeId);

    const reasonLabel = ADD_CASH_REASON_LABELS[reasonCode] ?? reasonCode;
    const fullReason = note?.trim()
      ? `Cash added to till — ${reasonLabel}: ${note.trim()}`
      : `Cash added to till — ${reasonLabel}`;

    const result = await measureServerOperation(
      'action.shift.add-cash',
      () => prisma.$transaction(async (tx) =>
        recordCashDrawerEntryTx(tx, {
          businessId,
          storeId: openShift.till.storeId,
          tillId: openShift.tillId,
          shiftId: openShift.id,
          createdByUserId: user.id,
          cashierUserId: user.id,
          entryType: 'CASH_ADJUSTMENT',
          amountPence,
          reasonCode,
          reason: fullReason,
          actor: { userId: user.id, userName: user.name ?? 'Unknown', userRole: user.role },
        })
      ),
      {
        businessId,
        storeId: openShift.till.storeId,
        action: 'addCashToTillAction',
        cacheState: 'write-through',
      },
      { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'action' },
    );

    revalidatePosTillShiftTags(businessId, storeId);
    revalidateTag('reports');
    revalidateOwnerDashboardCache();
    revalidatePath('/shifts');
    revalidatePath('/pos');
    revalidatePath('/reports/cash-drawer');
    return ok({ id: result.entry.id });
  });
}

export async function openShiftAction(
  formData: FormData
): Promise<ActionResult<{ id: string; tillId: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext();

    const tillId = formString(formData, 'tillId');
    const requestedStoreId = formString(formData, 'storeId');
    const openingCash = Math.max(0, toPence(formData.get('openingCash')));

    if (!tillId) return err('Please select a till first.');
    const selected = await resolveStoreFromTill(businessId, tillId, requestedStoreId);
    await requireSelectedStoreContext(undefined, selected.storeId);

    try {
      const shift = await performShiftOpen({
        businessId,
        storeId: selected.storeId,
        actor: { userId: user.id, userName: user.name, userRole: user.role },
        tillId: selected.tillId,
        openingCashPence: openingCash,
      });

      audit({
        businessId,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'CASH_DRAWER_OPEN',
        entity: 'Shift',
        entityId: shift.id,
        details: {
          tillId: shift.tillId,
          openingCashPence: shift.openingCashPence,
          beforeExpectedCashPence: 0,
          afterExpectedCashPence: shift.openingCashPence,
        },
      });

      revalidatePosTillShiftTags(businessId, selected.storeId);
      revalidatePath('/shifts');
      revalidatePath('/pos');
      return ok({ id: shift.id, tillId: shift.tillId });
    } catch (e) {
      const message = (e as Error).message || TILL_ALREADY_OPEN_MSG;
      return err(message);
    }
  });
}

export async function closeShiftAction(
  formData: FormData
): Promise<ActionResult<{ id: string; investigationId: string | null }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext();

    const shiftId = formString(formData, 'shiftId');
    let actualCash: number;
    try {
      actualCash = assertNonNegativeActualCash(toPence(formData.get('actualCash')));
    } catch (e) {
      return err((e as Error).message || NEGATIVE_ACTUAL_CASH_MSG);
    }
    const notes = formString(formData, 'notes') || null;
    const managerPin = formString(formData, 'managerPin');
    const varianceReasonCode = formString(formData, 'varianceReasonCode') || null;
    const varianceReason = formString(formData, 'varianceReason') || null;

    if (!shiftId) return err('Could not find the shift. Please refresh and try again.');
    const requestedStoreId = formString(formData, 'storeId');
    if (!requestedStoreId) return err(MISSING_STORE_CONTEXT_MSG);
    const closingShift = await prisma.shift.findFirst({
      where: { id: shiftId, till: { store: { businessId } } },
      select: { till: { select: { storeId: true } } },
    });
    if (!closingShift) return err('Could not find the shift. Please refresh and try again.');
    if (requestedStoreId !== closingShift.till.storeId) {
      return err(STORE_MISMATCH_MSG);
    }
    const storeId = closingShift.till.storeId;
    await requireSelectedStoreContext(undefined, storeId);
    if (!managerPin) return err('Manager PIN is required to close till.');

    const manager = await verifyManagerPin({ businessId, pin: managerPin });
    if (!manager) return err('Invalid manager PIN.');

    try {
      const result = await performShiftClose({
        businessId,
        actor: { userId: user.id, userName: user.name, userRole: user.role },
        shiftId,
        actualCash,
        notes,
        varianceReasonCode,
        varianceReason,
        approval: { mode: 'PIN', approvingManagerId: manager.id },
      });
      void sendCashVarianceAlert({ shiftId: result.id, businessId }).catch((error) => {
        appLog('warn', 'cash_variance_alert_failed', { businessId, stage: 'shift-close' });
        void error;
      });
      revalidatePosTillShiftTags(businessId, storeId);
      revalidateTag('reports');
      revalidateOwnerDashboardCache();
      revalidatePath('/shifts');
      revalidatePath('/shifts/variance');
      revalidatePath('/shifts/drawer');
      revalidatePath('/pos');
      revalidatePath('/reports', 'layout');
      return ok({ id: result.id, investigationId: result.investigationId });
    } catch (e) {
      return err((e as Error).message);
    }
  });
}

export async function getOpenShift(tillId: string) {
  const { businessId } = await withBusinessContext(undefined, { requireWrite: false });
  return prisma.shift.findFirst({
    where: { tillId, status: 'OPEN', till: { store: { businessId } } },
    include: {
      user: { select: { name: true } },
      till: { select: { name: true } },
    },
  });
}

export async function getShiftSummary(shiftId: string) {
  const { businessId } = await withBusinessContext(undefined, { requireWrite: false });
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, till: { store: { businessId } } },
    include: {
      user: { select: { name: true } },
      till: { select: { name: true } },
      cashDrawerEntries: {
        select: { entryType: true, amountPence: true },
      },
      salesInvoices: {
        include: { payments: true, lines: true },
      },
    },
  });

  if (!shift) return null;

  const cashSummary = summarizeCashDrawerEntries(shift.cashDrawerEntries);
  let cardTotal = 0;
  let transferTotal = 0;
  let momoTotal = 0;
  let salesCount = 0;
  let salesTotal = 0;

  for (const invoice of shift.salesInvoices) {
    if (invoice.paymentStatus === 'VOID' || invoice.paymentStatus === 'RETURNED') continue;
    salesCount += 1;
    salesTotal += invoice.totalPence;
    for (const payment of invoice.payments) {
      if (payment.method === 'CARD') cardTotal += payment.amountPence;
      else if (payment.method === 'TRANSFER') transferTotal += payment.amountPence;
      else if (payment.method === 'MOBILE_MONEY') momoTotal += payment.amountPence;
    }
  }

  return {
    ...shift,
    salesCount,
    salesTotal,
    expectedCash: shift.expectedCashPence,
    cardTotal,
    transferTotal,
    momoTotal,
    cashByType: cashSummary.byType,
  };
}

export async function closeShiftOwnerOverrideAction(
  formData: FormData
): Promise<ActionResult<{ id: string; investigationId: string | null }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['OWNER']);

    const shiftId = formString(formData, 'shiftId');
    let actualCash: number;
    try {
      actualCash = assertNonNegativeActualCash(toPence(formData.get('actualCash')));
    } catch (e) {
      return err((e as Error).message || NEGATIVE_ACTUAL_CASH_MSG);
    }
    const notes = formString(formData, 'notes') || null;
    const ownerPassword = formString(formData, 'ownerPassword');
    const overrideReasonCode = formString(formData, 'overrideReasonCode');
    const overrideJustification = formString(formData, 'overrideJustification');
    const varianceReasonCode = formString(formData, 'varianceReasonCode') || null;
    const varianceReason = formString(formData, 'varianceReason') || null;

    if (!shiftId) return err('Could not find the shift. Please refresh and try again.');
    const requestedStoreId = formString(formData, 'storeId');
    if (!requestedStoreId) return err(MISSING_STORE_CONTEXT_MSG);
    const overrideShift = await prisma.shift.findFirst({
      where: { id: shiftId, till: { store: { businessId } } },
      select: { till: { select: { storeId: true } } },
    });
    if (!overrideShift) return err('Could not find the shift. Please refresh and try again.');
    if (requestedStoreId !== overrideShift.till.storeId) {
      return err(STORE_MISMATCH_MSG);
    }
    const storeId = overrideShift.till.storeId;
    await requireSelectedStoreContext(['OWNER'], storeId);
    if (!ownerPassword) return err('Owner password is required for override.');
    if (!overrideReasonCode) return err('Override reason code is required.');
    if (!overrideJustification?.trim()) return err('Override justification is required.');

    const owner = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!owner) return err('User not found.');

    const bcrypt = (await import('bcryptjs')).default;
    const passwordValid = await bcrypt.compare(ownerPassword, owner.passwordHash);
    if (!passwordValid) return err('Incorrect password.');

    try {
      const result = await performShiftClose({
        businessId,
        actor: { userId: user.id, userName: user.name, userRole: user.role },
        shiftId,
        actualCash,
        notes,
        varianceReasonCode,
        varianceReason,
        approval: {
          mode: 'OWNER_OVERRIDE',
          approvingManagerId: user.id,
          overrideReasonCode,
          overrideJustification,
        },
      });
      void sendCashVarianceAlert({ shiftId: result.id, businessId }).catch((error) => {
        appLog('warn', 'cash_variance_alert_failed', { businessId, stage: 'shift-close' });
        void error;
      });
      revalidatePosTillShiftTags(businessId, storeId);
      revalidateTag('reports');
      revalidateOwnerDashboardCache();
      revalidatePath('/shifts');
      revalidatePath('/shifts/variance');
      revalidatePath('/shifts/drawer');
      revalidatePath('/pos');
      revalidatePath('/reports', 'layout');
      return ok({ id: result.id, investigationId: result.investigationId });
    } catch (e) {
      return err((e as Error).message);
    }
  });
}

function varianceActor(user: { id: string; name: string | null; role: string }) {
  return { userId: user.id, userName: user.name, userRole: user.role };
}

export async function assignCashVarianceAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const investigationId = formString(formData, 'investigationId');
    const reviewerUserId = formString(formData, 'reviewerUserId');
    if (!investigationId) return err('Investigation is required.');
    if (!reviewerUserId) return err('Select a manager or owner to review this variance.');

    try {
      const result = await assignCashVarianceReviewer({
        businessId,
        investigationId,
        reviewerUserId,
        actor: varianceActor(user),
      });
      revalidatePath('/shifts');
      revalidatePath('/shifts/variance');
      revalidatePath(`/shifts/variance/${investigationId}`);
      return ok({ id: result.id });
    } catch (e) {
      return err((e as Error).message);
    }
  });
}

export async function explainCashVarianceAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext();
    const investigationId = formString(formData, 'investigationId');
    const explanation = formString(formData, 'explanation');
    const evidenceNote = formString(formData, 'evidenceNote') || null;
    if (!investigationId) return err('Investigation is required.');
    if (!explanation.trim()) return err('A cashier explanation is required.');

    try {
      const result = await explainCashVariance({
        businessId,
        investigationId,
        explanation,
        evidenceNote,
        actor: varianceActor(user),
      });
      revalidatePath('/shifts');
      revalidatePath('/shifts/variance');
      revalidatePath(`/shifts/variance/${investigationId}`);
      return ok({ id: result.id });
    } catch (e) {
      return err((e as Error).message);
    }
  });
}

export async function resolveCashVarianceAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const investigationId = formString(formData, 'investigationId');
    const resolution = formString(formData, 'resolution');
    if (!investigationId) return err('Investigation is required.');
    if (!resolution.trim()) return err('A manager resolution is required.');

    try {
      const result = await resolveCashVariance({
        businessId,
        investigationId,
        resolution,
        actor: varianceActor(user),
      });
      revalidatePath('/shifts');
      revalidatePath('/shifts/variance');
      revalidatePath(`/shifts/variance/${investigationId}`);
      return ok({ id: result.id });
    } catch (e) {
      return err((e as Error).message);
    }
  });
}

export async function approveCashVarianceAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['OWNER']);
    const investigationId = formString(formData, 'investigationId');
    if (!investigationId) return err('Investigation is required.');

    try {
      const result = await approveCashVariance({
        businessId,
        investigationId,
        actor: varianceActor(user),
      });
      revalidatePath('/shifts');
      revalidatePath('/shifts/variance');
      revalidatePath(`/shifts/variance/${investigationId}`);
      return ok({ id: result.id });
    } catch (e) {
      return err((e as Error).message);
    }
  });
}
