import { prisma } from '@/lib/prisma';

export type CashDrawerEntryType =
  | 'OPEN_FLOAT'
  | 'CASH_SALE'
  | 'CASH_REFUND'
  | 'CASH_DEBTOR_PAYMENT'
  | 'PAID_OUT_SUPPLIER'
  | 'PAID_OUT_EXPENSE'
  | 'CLOSE_RECONCILIATION'
  | 'CASH_ADJUSTMENT';

export const CASH_DRAWER_ENTRY_LABELS: Record<string, string> = {
  OPEN_FLOAT: 'Opening float',
  CASH_SALE: 'Cash sales',
  CASH_DEBTOR_PAYMENT: 'Customer payments received',
  PAID_OUT_SUPPLIER: 'Supplier payments',
  PAID_OUT_EXPENSE: 'Expenses paid from till',
  CASH_REFUND: 'Refunds paid',
  CASH_ADJUSTMENT: 'Cash added / adjustments',
  CLOSE_RECONCILIATION: 'Close reconciliation',
};

export const CASH_DRAWER_BREAKDOWN_ORDER = [
  'OPEN_FLOAT',
  'CASH_SALE',
  'CASH_DEBTOR_PAYMENT',
  'PAID_OUT_SUPPLIER',
  'PAID_OUT_EXPENSE',
  'CASH_REFUND',
  'CASH_ADJUSTMENT',
] as const;

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

export async function getOpenCashShiftForPayment(
  tx: any,
  input: {
    businessId: string;
    storeId: string;
    userId?: string | null;
    fallbackTillId?: string | null;
  }
) {
  if (input.userId) {
    const userShift = await tx.shift.findFirst({
      where: {
        status: 'OPEN',
        userId: input.userId,
        till: {
          storeId: input.storeId,
          store: { businessId: input.businessId },
        },
      },
      select: { id: true, tillId: true },
      orderBy: { openedAt: 'desc' },
    });
    if (userShift) return userShift;
  }

  if (!input.fallbackTillId) return null;
  const tillShift = await getOpenShiftForTill(input.businessId, input.fallbackTillId, tx);
  return tillShift ? { id: tillShift.id, tillId: tillShift.tillId } : null;
}

export type CashPurchasePaymentRef = {
  id: string;
  method: string;
  amountPence: number;
};

export type CashDrawerEntryRef = {
  entryType: string;
  referenceType?: string | null;
  referenceId?: string | null;
};

/** Detect CASH purchase payments missing a linked PAID_OUT_SUPPLIER drawer entry. */
export function findOrphanCashPurchasePayments(
  payments: CashPurchasePaymentRef[],
  drawerEntries: CashDrawerEntryRef[]
) {
  return payments.filter((payment) => {
    if (payment.method !== 'CASH' || payment.amountPence <= 0) return false;
    return !drawerEntries.some(
      (entry) =>
        entry.entryType === 'PAID_OUT_SUPPLIER' &&
        entry.referenceType === 'PURCHASE_PAYMENT' &&
        entry.referenceId === payment.id
    );
  });
}

export type HistoricalCashSupplierPaymentAssessmentRow = {
  id: string;
  amountPence: number;
  paidAt: Date;
  recordedByUserId: string | null;
  linkedDrawerCount: number;
  shiftStatus: 'OPEN' | 'CLOSED' | 'NONE' | 'MIXED' | null;
};

export type HistoricalCashSupplierPaymentCategory =
  | 'properly_linked'
  | 'missing_drawer_link'
  | 'duplicate_drawer_links'
  | 'funding_source_ambiguous'
  | 'shift_association_unavailable';

export type HistoricalCashSupplierPaymentAggregate = {
  category: HistoricalCashSupplierPaymentCategory;
  recordCount: number;
  aggregateValuePence: number;
  closedShiftExposureCount: number;
  deterministic: boolean;
};

/**
 * Pure, read-only classification of historical CASH supplier payments vs drawer links.
 * Does not infer funding source. Missing idempotency keys are ignored (not orphans).
 */
export function assessHistoricalCashSupplierPayments(
  rows: HistoricalCashSupplierPaymentAssessmentRow[],
): HistoricalCashSupplierPaymentAggregate[] {
  const buckets: Record<
    HistoricalCashSupplierPaymentCategory,
    { amountPence: number; closed: number; deterministic: boolean }
  > = {
    properly_linked: { amountPence: 0, closed: 0, deterministic: true },
    missing_drawer_link: { amountPence: 0, closed: 0, deterministic: true },
    duplicate_drawer_links: { amountPence: 0, closed: 0, deterministic: true },
    funding_source_ambiguous: { amountPence: 0, closed: 0, deterministic: false },
    shift_association_unavailable: { amountPence: 0, closed: 0, deterministic: false },
  };

  const counts: Record<HistoricalCashSupplierPaymentCategory, number> = {
    properly_linked: 0,
    missing_drawer_link: 0,
    duplicate_drawer_links: 0,
    funding_source_ambiguous: 0,
    shift_association_unavailable: 0,
  };

  for (const row of rows) {
    let category: HistoricalCashSupplierPaymentCategory;
    if (row.linkedDrawerCount > 1) {
      category = 'duplicate_drawer_links';
    } else if (row.linkedDrawerCount === 1) {
      if (row.shiftStatus === 'NONE' || row.shiftStatus === null) {
        category = 'shift_association_unavailable';
      } else {
        category = 'properly_linked';
      }
    } else if (!row.recordedByUserId) {
      // Cash payment with no actor — cannot determine whether till funding was intended.
      category = 'funding_source_ambiguous';
    } else {
      category = 'missing_drawer_link';
    }

    counts[category] += 1;
    buckets[category].amountPence += row.amountPence;
    if (row.shiftStatus === 'CLOSED' || row.shiftStatus === 'MIXED') {
      buckets[category].closed += 1;
    }
  }

  return (Object.keys(counts) as HistoricalCashSupplierPaymentCategory[]).map((category) => ({
    category,
    recordCount: counts[category],
    aggregateValuePence: buckets[category].amountPence,
    closedShiftExposureCount: buckets[category].closed,
    deterministic: buckets[category].deterministic,
  }));
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

  const updateResult = await tx.shift.updateMany({
    where: {
      id: shift.id,
      tillId: input.tillId,
      status: 'OPEN',
    },
    data: {
      expectedCashPence: { increment: input.amountPence },
    },
  });
  if (updateResult.count !== 1) {
    throw new Error('No open shift for this till. Open till before cash operations.');
  }

  const updatedShift = await tx.shift.findUnique({
    where: { id: shift.id },
    select: { expectedCashPence: true },
  });
  if (!updatedShift) {
    throw new Error('Shift disappeared while recording the cash movement.');
  }
  const afterExpectedCashPence = updatedShift.expectedCashPence;
  const beforeExpectedCashPence = afterExpectedCashPence - input.amountPence;

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
