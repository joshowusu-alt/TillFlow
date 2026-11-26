import { prisma } from '@/lib/prisma';
import { cashDifferenceReason, isLargeCashDifference } from '@/lib/cash-difference-presentation';

export type HomeCashDifference = {
  id: string;
  storeId: string;
  storeName: string;
  cashier: string;
  date: Date;
  variancePence: number;
  reason: string;
  large: boolean;
};

export async function getUnreviewedHomeCashDifferences(businessId: string): Promise<HomeCashDifference[]> {
  const [business, rows] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { shiftCloseApprovalThresholdPence: true } }),
    prisma.cashVarianceInvestigation.findMany({
      where: {
        businessId,
        reviewedAt: null,
        status: { notIn: ['APPROVED', 'REVIEWED'] },
        variancePence: { not: 0 },
        shift: { status: 'CLOSED', till: { store: { businessId } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, createdAt: true, variancePence: true, cashierExplanation: true,
        shift: { select: { closedAt: true, varianceReasonCode: true, varianceReason: true, user: { select: { name: true } }, till: { select: { store: { select: { id: true, name: true } } } } } },
      },
    }),
  ]);
  return rows.map(row => ({
    id: row.id,
    storeId: row.shift.till.store.id,
    storeName: row.shift.till.store.name,
    cashier: row.shift.user.name,
    date: row.shift.closedAt ?? row.createdAt,
    variancePence: row.variancePence,
    reason: cashDifferenceReason(row.shift.varianceReasonCode, row.cashierExplanation, row.shift.varianceReason),
    large: isLargeCashDifference(row.variancePence, business?.shiftCloseApprovalThresholdPence ?? 5000),
  }));
}
