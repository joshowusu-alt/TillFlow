'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { formString, toPence } from '@/lib/form-helpers';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import { verifyManagerPin } from '@/lib/security/pin';
import { recordCashDrawerEntryTx, summarizeCashDrawerEntries } from '@/lib/services/cash-drawer';
import { performShiftClose } from '@/lib/services/shifts';

export async function openShiftAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext();

    const tillId = formString(formData, 'tillId');
    const openingCash = Math.max(0, toPence(formData.get('openingCash')));

    if (!tillId) return err('Please select a till first.');

    const till = await prisma.till.findFirst({
      where: { id: tillId, store: { businessId } },
      select: { id: true, storeId: true },
    });
    if (!till) return err('Till not found for your business.');

    const existingShift = await prisma.shift.findFirst({
      where: { tillId: till.id, status: 'OPEN' },
    });
    if (existingShift) return err('There is already an open shift for this till');

    const shift = await prisma.$transaction(async (tx) => {
      const created = await tx.shift.create({
        data: {
          tillId: till.id,
          userId: user.id,
          openingCashPence: openingCash,
          expectedCashPence: 0,
          status: 'OPEN',
        },
      });

      await recordCashDrawerEntryTx(tx, {
        businessId,
        storeId: till.storeId,
        tillId: till.id,
        shiftId: created.id,
        createdByUserId: user.id,
        cashierUserId: user.id,
        entryType: 'OPEN_FLOAT',
        amountPence: openingCash,
        reasonCode: 'OPEN_FLOAT',
        reason: 'Till opened with float',
        referenceType: 'SHIFT',
        referenceId: created.id,
        actor: { userId: user.id, userName: user.name ?? 'Unknown', userRole: user.role },
      });

      return created;
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
        tillId: till.id,
        openingCashPence: openingCash,
        beforeExpectedCashPence: 0,
        afterExpectedCashPence: openingCash,
      },
    });

    revalidatePath('/shifts');
    return ok({ id: shift.id });
  });
}

export async function closeShiftAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext();

    const shiftId = formString(formData, 'shiftId');
    const actualCash = Math.max(0, toPence(formData.get('actualCash')));
    const notes = formString(formData, 'notes') || null;
    const managerPin = formString(formData, 'managerPin');
    const varianceReasonCode = formString(formData, 'varianceReasonCode') || null;
    const varianceReason = formString(formData, 'varianceReason') || null;

    if (!shiftId) return err('Could not find the shift. Please refresh and try again.');
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
      revalidatePath('/shifts');
      return ok({ id: result.id });
    } catch (e) {
      return err((e as Error).message);
    }
  });
}

export async function getOpenShift(tillId: string) {
  const { businessId } = await withBusinessContext();
  return prisma.shift.findFirst({
    where: { tillId, status: 'OPEN', till: { store: { businessId } } },
    include: {
      user: { select: { name: true } },
      till: { select: { name: true } },
    },
  });
}

export async function getShiftSummary(shiftId: string) {
  const { businessId } = await withBusinessContext();
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
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['OWNER']);

    const shiftId = formString(formData, 'shiftId');
    const actualCash = Math.max(0, toPence(formData.get('actualCash')));
    const notes = formString(formData, 'notes') || null;
    const ownerPassword = formString(formData, 'ownerPassword');
    const overrideReasonCode = formString(formData, 'overrideReasonCode');
    const overrideJustification = formString(formData, 'overrideJustification');
    const varianceReasonCode = formString(formData, 'varianceReasonCode') || null;
    const varianceReason = formString(formData, 'varianceReason') || null;

    if (!shiftId) return err('Could not find the shift. Please refresh and try again.');
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
      revalidatePath('/shifts');
      return ok({ id: result.id });
    } catch (e) {
      return err((e as Error).message);
    }
  });
}
