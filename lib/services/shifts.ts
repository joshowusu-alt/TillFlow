import { prisma } from '@/lib/prisma';
import { recordCashDrawerEntryTx, summarizeCashDrawerEntries } from '@/lib/services/cash-drawer';
import { createCashVarianceInvestigationTx } from '@/lib/services/cash-variance';
import { reserveNextDocumentNumber } from '@/lib/services/document-numbers';
import { isPrismaUniqueConstraintOn } from '@/lib/services/money-idempotency';
import { detectCashVarianceRisk } from '@/lib/services/risk-monitor';
import { audit } from '@/lib/audit';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import { isSqliteDatabaseUrl } from '@/lib/database-runtime';

export const TILL_ALREADY_OPEN_MSG =
  'A shift is already open for this till. Close or hand over that shift before opening another.';

export const NEGATIVE_ACTUAL_CASH_MSG =
  'Physical cash counted cannot be negative. Enter the amount actually in the drawer.';

export function assertNonNegativeActualCash(actualCash: number): number {
  if (!Number.isFinite(actualCash) || actualCash < 0) {
    throw new Error(NEGATIVE_ACTUAL_CASH_MSG);
  }
  return Math.round(actualCash);
}

function isOpenKeyUniqueConflict(error: unknown): boolean {
  if (isPrismaUniqueConstraintOn(error, ['openKey'])) return true;
  const e = error as { code?: string; message?: string; meta?: { target?: unknown } };
  if (e?.code !== 'P2002') return false;
  const target = JSON.stringify(e.meta?.target ?? e.message ?? '');
  return target.includes('openKey');
}

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
  tillId: string;
  userId: string;
  openedAt: Date;
  openingCashPence: number;
  expectedCashPence: number;
  shiftNumber?: string | null;
  till: { name: string };
  user: { name: string };
  cashDrawerEntries: Array<{ entryType: string; amountPence: number }>;
  salesInvoices: Array<{
    totalPence: number;
    payments: Array<{ method: string; amountPence: number }>;
  }>;
};

export type StoreTillOccupancyRow = OpenShiftForUserRow;

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
      tillId: true,
      userId: true,
      openedAt: true,
      openingCashPence: true,
      expectedCashPence: true,
      shiftNumber: true,
      till: { select: { name: true } },
      user: { select: { name: true } },
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

const STORE_OPEN_SHIFT_SELECT = {
  id: true,
  tillId: true,
  userId: true,
  openedAt: true,
  openingCashPence: true,
  expectedCashPence: true,
  shiftNumber: true,
  till: { select: { name: true } },
  user: { select: { name: true } },
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
} as const;

/** Every OPEN shift on the store's tills — occupancy, not just the current user. */
export async function getStoreTillOccupancy(
  storeId: string,
  db: any = prisma,
): Promise<StoreTillOccupancyRow[]> {
  return db.shift.findMany({
    where: {
      status: 'OPEN',
      till: { storeId },
    },
    select: STORE_OPEN_SHIFT_SELECT,
    orderBy: { openedAt: 'asc' },
  }) as Promise<StoreTillOccupancyRow[]>;
}

export type OpenShiftInput = {
  businessId: string;
  storeId: string;
  actor: { userId: string; userName: string | null; userRole: string };
  tillId: string;
  openingCashPence: number;
};

export async function performShiftOpen(
  input: OpenShiftInput,
): Promise<{ id: string; tillId: string; storeId: string; openingCashPence: number }> {
  return measureServerOperation(
    'action.shift.open',
    () => performShiftOpenImpl(input),
    {
      businessId: input.businessId,
      storeId: input.storeId,
      action: 'openShiftAction',
      cacheState: 'write-through',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'action' },
  );
}

async function performShiftOpenImpl(
  input: OpenShiftInput,
): Promise<{ id: string; tillId: string; storeId: string; openingCashPence: number }> {
  const openingCashPence = Math.max(0, Math.round(input.openingCashPence));

  const till = await prisma.till.findFirst({
    where: {
      id: input.tillId,
      active: true,
      storeId: input.storeId,
      store: { businessId: input.businessId },
    },
    select: { id: true, storeId: true, store: { select: { businessId: true } } },
  });
  if (!till || till.store.businessId !== input.businessId) {
    throw new Error('Till not found for your business.');
  }

  const created = await prisma.$transaction(async (tx) => {
    const existingShift = await tx.shift.findFirst({
      where: { tillId: till.id, status: 'OPEN' },
      select: { id: true },
    });
    if (existingShift) {
      throw new Error(TILL_ALREADY_OPEN_MSG);
    }

    const shiftNumber = await reserveNextDocumentNumber(tx, input.businessId, 'shift');
    let shift;
    try {
      shift = await tx.shift.create({
        data: {
          tillId: till.id,
          userId: input.actor.userId,
          openingCashPence,
          expectedCashPence: 0,
          status: 'OPEN',
          openKey: till.id,
          shiftNumber,
        },
      });
    } catch (error) {
      if (isOpenKeyUniqueConflict(error)) {
        throw new Error(TILL_ALREADY_OPEN_MSG);
      }
      throw error;
    }

    await recordCashDrawerEntryTx(tx, {
      businessId: input.businessId,
      storeId: till.storeId,
      tillId: till.id,
      shiftId: shift.id,
      createdByUserId: input.actor.userId,
      cashierUserId: input.actor.userId,
      entryType: 'OPEN_FLOAT',
      amountPence: openingCashPence,
      reasonCode: 'OPEN_FLOAT',
      reason: 'Till opened with float',
      referenceType: 'SHIFT',
      referenceId: shift.id,
      actor: {
        userId: input.actor.userId,
        userName: input.actor.userName ?? 'Unknown',
        userRole: input.actor.userRole,
      },
    });

    return shift;
  });

  return {
    id: created.id,
    tillId: till.id,
    storeId: till.storeId,
    openingCashPence,
  };
}

export async function performShiftClose(
  input: CloseShiftInput,
): Promise<{ id: string; closureNumber: string | null; investigationId: string | null }> {
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

async function performShiftCloseImpl(
  input: CloseShiftInput,
): Promise<{ id: string; closureNumber: string | null; investigationId: string | null }> {
  const { businessId, actor, shiftId, notes, varianceReasonCode, varianceReason, approval } = input;
  const actualCash = assertNonNegativeActualCash(input.actualCash);

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
    assertNonNegativeActualCash(actualCash);

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

    const closureNumber = await reserveNextDocumentNumber(tx, businessId, 'shift_closure');

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
        closureNumber,
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

    const investigation = await createCashVarianceInvestigationTx(tx as never, {
      businessId,
      shiftId: lockedShift.id,
      variancePence: lockedVariance,
      cashierExplanation: varianceReason,
      actor,
    });

    return {
      expectedCashPence: lockedExpectedCash,
      actualCashPence: actualCash,
      variancePence: lockedVariance,
      closureNumber,
      investigationId: investigation?.id ?? null,
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

  return {
    id: shift.id,
    closureNumber: closedState.closureNumber,
    investigationId: closedState.investigationId,
  };
}
