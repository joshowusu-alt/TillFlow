'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { formString } from '@/lib/form-helpers';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import { verifyManagerPin } from '@/lib/security/pin';
import { recordCashDrawerEntryTx, summarizeCashDrawerEntries } from '@/lib/services/cash-drawer';
import { detectCashVarianceRisk } from '@/lib/services/risk-monitor';

const toPence = (value: unknown) => Math.round(Number(value || 0) * 100);

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

    await audit({
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

    const shift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        till: { store: { businessId } },
      },
      include: {
        till: { select: { id: true, storeId: true, name: true } },
        salesInvoices: { include: { payments: true } },
        cashDrawerEntries: {
          select: { id: true, entryType: true, amountPence: true, createdAt: true },
        },
      },
    });
    if (!shift) return err('That shift could not be found. It may have been removed.');
    if (shift.status !== 'OPEN') return err('Shift is already closed');

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { varianceReasonRequired: true, cashVarianceRiskThresholdPence: true },
    });

    const expectedCash = shift.expectedCashPence;
    const variance = actualCash - expectedCash;
    if (variance !== 0 && business?.varianceReasonRequired && !varianceReasonCode && !varianceReason) {
      return err('Variance reason is required when counted cash differs from expected.');
    }

    let cardTotal = 0;
    let transferTotal = 0;
    let momoTotal = 0;
    for (const invoice of shift.salesInvoices) {
      for (const payment of invoice.payments) {
        if (payment.method === 'CARD') cardTotal += payment.amountPence;
        else if (payment.method === 'TRANSFER') transferTotal += payment.amountPence;
        else if (payment.method === 'MOBILE_MONEY') momoTotal += payment.amountPence;
      }
    }

    const entriesSummary = summarizeCashDrawerEntries(shift.cashDrawerEntries);
    const snapshot = {
      shiftId: shift.id,
      tillId: shift.tillId,
      tillName: shift.till.name,
      openedAt: shift.openedAt.toISOString(),
      closedAt: new Date().toISOString(),
      openingCashPence: shift.openingCashPence,
      expectedCashPence: expectedCash,
      countedCashPence: actualCash,
      variancePence: variance,
      varianceReasonCode,
      varianceReason,
      cardTotalPence: cardTotal,
      transferTotalPence: transferTotal,
      momoTotalPence: momoTotal,
      cashEntriesByType: entriesSummary.byType,
      cashEntriesTotalPence: entriesSummary.totalPence,
      managerApprovedByUserId: manager.id,
    };

    await prisma.$transaction(async (tx) => {
      await recordCashDrawerEntryTx(tx, {
        businessId,
        storeId: shift.till.storeId,
        tillId: shift.tillId,
        shiftId: shift.id,
        createdByUserId: user.id,
        cashierUserId: user.id,
        entryType: 'CLOSE_RECONCILIATION',
        amountPence: 0,
        reasonCode: variance === 0 ? 'RECONCILED' : variance > 0 ? 'OVER' : 'SHORT',
        reason: varianceReason ?? notes ?? 'Till closed',
        referenceType: 'SHIFT',
        referenceId: shift.id,
        actor: { userId: user.id, userName: user.name ?? 'Unknown', userRole: user.role },
      });

      await tx.shift.update({
        where: { id: shift.id },
        data: {
          closedAt: new Date(),
          expectedCashPence: expectedCash,
          actualCashPence: actualCash,
          cardTotalPence: cardTotal,
          transferTotalPence: transferTotal,
          momoTotalPence: momoTotal,
          variance,
          varianceReasonCode,
          varianceReason,
          notes,
          closedByUserId: user.id,
          closeManagerApprovedByUserId: manager.id,
          closeManagerApprovalMode: 'PIN',
          closureSnapshotJson: JSON.stringify(snapshot),
          status: 'CLOSED',
        },
      });
    });

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'CASH_DRAWER_CLOSE',
      entity: 'Shift',
      entityId: shift.id,
      details: {
        expectedCashPence: expectedCash,
        countedCashPence: actualCash,
        variancePence: variance,
        varianceReasonCode,
        managerApprovedByUserId: manager.id,
      },
    });

    await detectCashVarianceRisk({
      businessId,
      storeId: shift.till.storeId,
      cashierUserId: shift.userId,
      shiftId: shift.id,
      variancePence: variance,
      thresholdPence: business?.cashVarianceRiskThresholdPence ?? 2000,
    });

    revalidatePath('/shifts');
    return ok({ id: shift.id });
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
