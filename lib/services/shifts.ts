import { prisma } from '@/lib/prisma';
import { recordCashDrawerEntryTx, summarizeCashDrawerEntries } from '@/lib/services/cash-drawer';
import { detectCashVarianceRisk } from '@/lib/services/risk-monitor';
import { audit } from '@/lib/audit';

export type CloseShiftApproval =
  | { mode: 'PIN'; approvingManagerId: string }
  | {
      mode: 'OWNER_OVERRIDE';
      approvingManagerId: string;
      overrideReasonCode: string;
      overrideJustification: string;
    };

export type CloseShiftInput = {
  businessId: string;
  actor: { userId: string; userName: string | null; userRole: string };
  shiftId: string;
  actualCash: number;
  notes: string | null;
  varianceReasonCode: string | null;
  varianceReason: string | null;
  approval: CloseShiftApproval;
};

export async function performShiftClose(input: CloseShiftInput): Promise<{ id: string }> {
  const { businessId, actor, shiftId, actualCash, notes, varianceReasonCode, varianceReason, approval } = input;

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
  if (!shift) throw new Error('That shift could not be found. It may have been removed.');
  if (shift.status !== 'OPEN') throw new Error('Shift is already closed');

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { varianceReasonRequired: true, cashVarianceRiskThresholdPence: true },
  });

  const expectedCash = shift.expectedCashPence;
  const variance = actualCash - expectedCash;
  if (variance !== 0 && business?.varianceReasonRequired && !varianceReasonCode && !varianceReason) {
    throw new Error('Variance reason is required when counted cash differs from expected.');
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

  const snapshotBase = {
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
  };

  const snapshot =
    approval.mode === 'OWNER_OVERRIDE'
      ? {
          ...snapshotBase,
          ownerOverride: true,
          ownerOverrideReasonCode: approval.overrideReasonCode,
          ownerOverrideJustification: approval.overrideJustification,
          overrideByUserId: actor.userId,
        }
      : {
          ...snapshotBase,
          managerApprovedByUserId: approval.approvingManagerId,
        };

  const defaultCloseReason =
    approval.mode === 'OWNER_OVERRIDE' ? 'Till closed (owner override)' : 'Till closed';

  await prisma.$transaction(async (tx) => {
    await recordCashDrawerEntryTx(tx, {
      businessId,
      storeId: shift.till.storeId,
      tillId: shift.tillId,
      shiftId: shift.id,
      createdByUserId: actor.userId,
      cashierUserId: actor.userId,
      entryType: 'CLOSE_RECONCILIATION',
      amountPence: 0,
      reasonCode: variance === 0 ? 'RECONCILED' : variance > 0 ? 'OVER' : 'SHORT',
      reason: varianceReason ?? notes ?? defaultCloseReason,
      referenceType: 'SHIFT',
      referenceId: shift.id,
      actor: { userId: actor.userId, userName: actor.userName ?? 'Unknown', userRole: actor.userRole },
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
        closedByUserId: actor.userId,
        closeManagerApprovedByUserId: approval.approvingManagerId,
        closeManagerApprovalMode: approval.mode === 'PIN' ? 'PIN' : 'OWNER_OVERRIDE',
        closureSnapshotJson: JSON.stringify(snapshot),
        status: 'CLOSED',
        ...(approval.mode === 'OWNER_OVERRIDE' && {
          ownerOverride: true,
          ownerOverrideReasonCode: approval.overrideReasonCode,
          ownerOverrideJustification: approval.overrideJustification,
        }),
      },
    });
  });

  const auditDetails =
    approval.mode === 'OWNER_OVERRIDE'
      ? {
          expectedCashPence: expectedCash,
          countedCashPence: actualCash,
          variancePence: variance,
          varianceReasonCode,
          ownerOverride: true,
          overrideReasonCode: approval.overrideReasonCode,
          overrideJustification: approval.overrideJustification,
        }
      : {
          expectedCashPence: expectedCash,
          countedCashPence: actualCash,
          variancePence: variance,
          varianceReasonCode,
          managerApprovedByUserId: approval.approvingManagerId,
        };

  audit({
    businessId,
    userId: actor.userId,
    userName: actor.userName,
    userRole: actor.userRole,
    action: 'CASH_DRAWER_CLOSE',
    entity: 'Shift',
    entityId: shift.id,
    details: auditDetails,
  });

  await detectCashVarianceRisk({
    businessId,
    storeId: shift.till.storeId,
    cashierUserId: shift.userId,
    shiftId: shift.id,
    variancePence: variance,
    thresholdPence: business?.cashVarianceRiskThresholdPence ?? 2000,
  });

  return { id: shift.id };
}
