import { prisma } from '@/lib/prisma';

export type CashDrawerEntryType =
  | 'OPEN_FLOAT'
  | 'CASH_SALE'
  | 'CASH_REFUND'
  | 'CASH_DEBTOR_PAYMENT'
  | 'PAID_OUT_EXPENSE'
  | 'CLOSE_RECONCILIATION'
  | 'CASH_ADJUSTMENT';

export type CashDrawerAuditActor = {
  userId: string;
  userName: string;
  userRole: string;
};

export async function getOpenShiftForTill(
  businessId: string,
  tillId: string,
  tx: any = prisma
) {
  return tx.shift.findFirst({
    where: {
      tillId,
      status: 'OPEN',
      till: {
        store: { businessId },
      },
    },
    orderBy: { openedAt: 'desc' },
  });
}

function toJson(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function recordCashDrawerEntryTx(
  tx: any,
  input: {
    businessId: string;
    storeId: string;
    tillId: string;
    shiftId?: string | null;
    createdByUserId: string;
    cashierUserId?: string | null;
    entryType: CashDrawerEntryType;
    amountPence: number;
    reasonCode?: string | null;
    reason?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
    actor?: CashDrawerAuditActor;
  }
) {
  const shift =
    (input.shiftId
      ? await tx.shift.findFirst({
          where: {
            id: input.shiftId,
            tillId: input.tillId,
            status: 'OPEN',
          },
        })
      : await getOpenShiftForTill(input.businessId, input.tillId, tx)) ?? null;

  if (!shift) {
    throw new Error('No open shift for this till. Open till before cash operations.');
  }

  const beforeExpectedCashPence = shift.expectedCashPence ?? 0;
  const afterExpectedCashPence = beforeExpectedCashPence + input.amountPence;

  const entry = await tx.cashDrawerEntry.create({
    data: {
      businessId: input.businessId,
      storeId: input.storeId,
      tillId: input.tillId,
      shiftId: shift.id,
      createdByUserId: input.createdByUserId,
      cashierUserId: input.cashierUserId ?? null,
      entryType: input.entryType,
      amountPence: input.amountPence,
      reasonCode: input.reasonCode ?? null,
      reason: input.reason ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      beforeExpectedCashPence,
      afterExpectedCashPence,
    },
  });

  await tx.shift.update({
    where: { id: shift.id },
    data: { expectedCashPence: afterExpectedCashPence },
  });

  let actor = input.actor;
  if (!actor) {
    const user = await tx.user.findUnique({
      where: { id: input.createdByUserId },
      select: { id: true, name: true, role: true },
    });
    if (user) {
      actor = {
        userId: user.id,
        userName: user.name ?? 'Unknown',
        userRole: user.role,
      };
    }
  }
  await tx.auditLog.create({
    data: {
      businessId: input.businessId,
      userId: input.createdByUserId,
      userName: actor?.userName ?? 'System',
      userRole: actor?.userRole ?? 'SYSTEM',
      action: 'CASH_DRAWER_ENTRY',
      entity: 'CashDrawerEntry',
      entityId: entry.id,
      beforeState: toJson({ expectedCashPence: beforeExpectedCashPence }),
      afterState: toJson({ expectedCashPence: afterExpectedCashPence }),
      reason: input.reason ?? null,
      details: toJson({
        entryType: input.entryType,
        amountPence: input.amountPence,
        tillId: input.tillId,
        shiftId: shift.id,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
      }),
      branchId: null,
      actionType: 'CASH_DRAWER',
      entityType: 'CASH_DRAWER_ENTRY',
    },
  });

  return {
    entry,
    shiftId: shift.id,
    beforeExpectedCashPence,
    afterExpectedCashPence,
  };
}

export async function recordCashDrawerEntry(
  input: Parameters<typeof recordCashDrawerEntryTx>[1]
) {
  return prisma.$transaction(async (tx) => recordCashDrawerEntryTx(tx, input));
}

export function summarizeCashDrawerEntries(
  entries: Array<{ entryType: string; amountPence: number }>
) {
  return entries.reduce(
    (acc, entry) => {
      acc.totalPence += entry.amountPence;
      acc.byType[entry.entryType] = (acc.byType[entry.entryType] ?? 0) + entry.amountPence;
      return acc;
    },
    { totalPence: 0, byType: {} as Record<string, number> }
  );
}
