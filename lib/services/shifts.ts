import { prisma } from '@/lib/prisma';
import { recordCashDrawerEntryTx, summarizeCashDrawerEntries } from '@/lib/services/cash-drawer';
import { detectCashVarianceRisk } from '@/lib/services/risk-monitor';
import { audit } from '@/lib/audit';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import { isSqliteDatabaseUrl } from '@/lib/database-runtime';

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

export type OpenShiftForUserRow = {
  id: string;
  openedAt: Date;
  openingCashPence: number;
  expectedCashPence: number;
  till: { name: string };
  cashDrawerEntries: Array<{ entryType: string; amountPence: number }>;
  salesInvoices: Array<{
    totalPence: number;
    payments: Array<{ method: string; amountPence: number }>;
  }>;
};

export async function getOpenShiftsForUserInStore(
  userId: string,
  storeId: string,
  db: any = prisma,
): Promise<OpenShiftForUserRow[]> {
  return db.shift.findMany({
    where: {
      userId,
      status: 'OPEN',
      till: { storeId },
    },
    select: {
      id: true,
      openedAt: true,
      openingCashPence: true,
      expectedCashPence: true,
      till: { select: { name: true } },
      cashDrawerEntries: {
        select: { entryType: true, amountPence: true },
      },
      salesInvoices: {
        where: { paymentStatus: { notIn: ['VOID', 'RETURNED'] } },
        select: {
          totalPence: true,
          payments: { select: { method: true, amountPence: true } },
        },
      },
    },
    orderBy: { openedAt: 'asc' },
  }) as Promise<OpenShiftForUserRow[]>;
}

export async function performShiftClose(input: CloseShiftInput): Promise<{ id: string }> {
  return measureServerOperation(
    'action.shift.close',
    () => performShiftCloseImpl(input),
    {
      businessId: input.businessId,
      action: 'closeShiftAction',
      cacheState: 'write-through',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'action' },
  );
}

async function performShiftCloseImpl(input: CloseShiftInput): Promise<{ id: string }> {
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

  const defaultCloseReason =
    approval.mode === 'OWNER_OVERRIDE' ? 'Till closed (owner override)' : 'Till closed';

  const closedState = await prisma.$transaction(async (tx) => {
    if (!isSqliteDatabaseUrl(process.env.DATABASE_URL)) {
      await tx.$queryRaw`SELECT "id" FROM "Shift" WHERE "id" = ${shift.id} FOR UPDATE`;
    }

    const lockedShift = await tx.shift.findFirst({
      where: {
        id: shift.id,
        status: 'OPEN',
        till: { store: { businessId } },
      },
      include: {
        till: { select: { id: true, storeId: true, name: true } },
        salesInvoices: {
          where: { paymentStatus: { notIn: ['VOID', 'RETURNED'] } },
          include: { payments: true },
        },
        cashDrawerEntries: {
          select: { id: true, entryType: true, amountPence: true, createdAt: true },
        },
      },
    });
    if (!lockedShift) {
      throw new Error('Shift was already closed by another request');
    }

    let lockedCardTotal = 0;
    let lockedTransferTotal = 0;
    let lockedMomoTotal = 0;
    for (const invoice of lockedShift.salesInvoices) {
      for (const payment of invoice.payments) {
        if (payment.method === 'CARD') lockedCardTotal += payment.amountPence;
        else if (payment.method === 'TRANSFER') lockedTransferTotal += payment.amountPence;
        else if (payment.method === 'MOBILE_MONEY') lockedMomoTotal += payment.amountPence;
      }
    }
    const lockedExpectedCash = lockedShift.expectedCashPence;
    // Expected cash is the drawer running balance (float + cash sales + receipts
    // + additions − supplier/expense/refunds/removals), not invoice CASH re-sum.
    const lockedVariance = actualCash - lockedExpectedCash;
    if (
      lockedVariance !== 0 &&
      business?.varianceReasonRequired &&
      !varianceReasonCode &&
      !varianceReason
    ) {
      throw new Error('Variance reason is required when counted cash differs from expected.');
    }
    const lockedEntriesSummary = summarizeCashDrawerEntries(lockedShift.cashDrawerEntries);
    const lockedSnapshotBase = {
      shiftId: lockedShift.id,
      tillId: lockedShift.tillId,
      tillName: lockedShift.till.name,
      openedAt: lockedShift.openedAt.toISOString(),
      closedAt: new Date().toISOString(),
      openingCashPence: lockedShift.openingCashPence,
      expectedCashPence: lockedExpectedCash,
      countedCashPence: actualCash,
      variancePence: lockedVariance,
      varianceReasonCode,
      varianceReason,
      cardTotalPence: lockedCardTotal,
      transferTotalPence: lockedTransferTotal,
      momoTotalPence: lockedMomoTotal,
      cashEntriesByType: lockedEntriesSummary.byType,
      cashEntriesTotalPence: lockedEntriesSummary.totalPence,
    };
    const lockedSnapshot =
      approval.mode === 'OWNER_OVERRIDE'
        ? {
            ...lockedSnapshotBase,
            ownerOverride: true,
            ownerOverrideReasonCode: approval.overrideReasonCode,
            ownerOverrideJustification: approval.overrideJustification,
            overrideByUserId: actor.userId,
          }
        : {
            ...lockedSnapshotBase,
            managerApprovedByUserId: approval.approvingManagerId,
          };

    await recordCashDrawerEntryTx(tx, {
      businessId,
      storeId: lockedShift.till.storeId,
      tillId: lockedShift.tillId,
      shiftId: lockedShift.id,
      createdByUserId: actor.userId,
      cashierUserId: actor.userId,
      entryType: 'CLOSE_RECONCILIATION',
      amountPence: 0,
      reasonCode: lockedVariance === 0 ? 'RECONCILED' : lockedVariance > 0 ? 'OVER' : 'SHORT',
      reason: varianceReason ?? notes ?? defaultCloseReason,
      referenceType: 'SHIFT',
      referenceId: lockedShift.id,
      actor: { userId: actor.userId, userName: actor.userName ?? 'Unknown', userRole: actor.userRole },
    });

    const updateResult = await tx.shift.updateMany({
      where: { id: lockedShift.id, status: 'OPEN' },
      data: {
        closedAt: new Date(),
        expectedCashPence: lockedExpectedCash,
        actualCashPence: actualCash,
        cardTotalPence: lockedCardTotal,
        transferTotalPence: lockedTransferTotal,
        momoTotalPence: lockedMomoTotal,
        variance: lockedVariance,
        varianceReasonCode,
        varianceReason,
        notes,
        closedByUserId: actor.userId,
        closeManagerApprovedByUserId: approval.approvingManagerId,
        closeManagerApprovalMode: approval.mode === 'PIN' ? 'PIN' : 'OWNER_OVERRIDE',
        closureSnapshotJson: JSON.stringify(lockedSnapshot),
        status: 'CLOSED',
        openKey: null,
        ...(approval.mode === 'OWNER_OVERRIDE' && {
          ownerOverride: true,
          ownerOverrideReasonCode: approval.overrideReasonCode,
          ownerOverrideJustification: approval.overrideJustification,
        }),
      },
    });
    if (updateResult.count === 0) {
      throw new Error('Shift was already closed by another request');
    }
    return {
      expectedCashPence: lockedExpectedCash,
      variancePence: lockedVariance,
    };
  });

  const auditDetails =
    approval.mode === 'OWNER_OVERRIDE'
      ? {
          expectedCashPence: closedState.expectedCashPence,
          countedCashPence: actualCash,
          variancePence: closedState.variancePence,
          varianceReasonCode,
          ownerOverride: true,
          overrideReasonCode: approval.overrideReasonCode,
          overrideJustification: approval.overrideJustification,
        }
      : {
          expectedCashPence: closedState.expectedCashPence,
          countedCashPence: actualCash,
          variancePence: closedState.variancePence,
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
    variancePence: closedState.variancePence,
    thresholdPence: business?.cashVarianceRiskThresholdPence ?? 2000,
  });

  return { id: shift.id };
}
