import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import { getOpenShiftsForUserInStore, getStoreTillOccupancy } from '@/lib/services/shifts';
import ShiftClient from './ShiftClient';

function summarizeOpenShift(openShift: {
  id: string;
  tillId: string;
  userId: string;
  openedAt: Date;
  openingCashPence: number;
  expectedCashPence: number;
  till: { name: string };
  user: { name: string };
  cashDrawerEntries: Array<{ entryType: string; amountPence: number }>;
  salesInvoices: Array<{
    totalPence: number;
    payments: Array<{ method: string; amountPence: number }>;
  }>;
}) {
  let cardTotal = 0;
  let transferTotal = 0;
  let momoTotal = 0;
  let salesTotal = 0;

  for (const invoice of openShift.salesInvoices) {
    salesTotal += invoice.totalPence;
    for (const payment of invoice.payments) {
      if (payment.method === 'CARD') cardTotal += payment.amountPence;
      if (payment.method === 'TRANSFER') transferTotal += payment.amountPence;
      if (payment.method === 'MOBILE_MONEY') momoTotal += payment.amountPence;
    }
  }

  const cashByType = openShift.cashDrawerEntries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.entryType] = (acc[entry.entryType] ?? 0) + entry.amountPence;
    return acc;
  }, {});

  return {
    ...openShift,
    salesCount: openShift.salesInvoices.length,
    salesTotal,
    expectedCash: openShift.expectedCashPence,
    cardTotal,
    transferTotal,
    momoTotal,
    cashByType,
  };
}

export default async function ShiftsPage() {
  const { user, business, store: baseStore } = await requireBusinessStore();

  const isManagerOrOwner = user.role === 'OWNER' || user.role === 'MANAGER';

  // Run all queries in parallel — tills, every current-user open shift, and recent shifts.
  const [tills, openShifts, recentShifts, storeOccupancy] = await Promise.all([
    prisma.till.findMany({
      where: { storeId: baseStore.id },
      select: { id: true, name: true, active: true }
    }),
    getOpenShiftsForUserInStore(user.id, baseStore.id),
    prisma.shift.findMany({
      where: { till: { storeId: baseStore.id } },
      orderBy: { openedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        status: true,
        openingCashPence: true,
        expectedCashPence: true,
        actualCashPence: true,
        variance: true,
        closureNumber: true,
        cardTotalPence: true,
        transferTotalPence: true,
        momoTotalPence: true,
        user: { select: { name: true } },
        till: { select: { name: true } },
        cashVarianceInvestigation: {
          select: { id: true, status: true, transactionNumber: true },
        },
        _count: { select: { salesInvoices: { where: { paymentStatus: { notIn: ['VOID', 'RETURNED'] } } } } }
      }
    }),
    getStoreTillOccupancy(baseStore.id),
  ]);

  const openShiftSummaries = openShifts.map(summarizeOpenShift);
  const occupiedTills = storeOccupancy.map((row) => {
    const summary = summarizeOpenShift(row);
    return {
      tillId: row.tillId,
      tillName: row.till.name,
      shiftId: row.id,
      userId: row.userId,
      userName: row.user.name,
      openedAt: row.openedAt.toISOString(),
      openingCashPence: row.openingCashPence,
      salesCount: summary.salesCount,
      salesTotal: summary.salesTotal,
      expectedCash: summary.expectedCash,
      cardTotal: summary.cardTotal,
      transferTotal: summary.transferTotal,
      momoTotal: summary.momoTotal,
      cashByType: summary.cashByType,
    };
  });

  const otherOpenShiftSummaries = isManagerOrOwner
    ? occupiedTills
        .filter((row) => row.userId !== user.id)
        .map((row) => ({
          id: row.shiftId,
          tillId: row.tillId,
          till: { name: row.tillName },
          userName: row.userName,
          openedAt: row.openedAt,
          openingCashPence: row.openingCashPence,
          salesCount: row.salesCount,
          salesTotal: row.salesTotal,
          expectedCash: row.expectedCash,
          cardTotal: row.cardTotal,
          transferTotal: row.transferTotal,
          momoTotal: row.momoTotal,
          cashByType: row.cashByType,
        }))
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-1 rounded-[1.5rem] border border-slate-200/80 bg-white/80 px-4 py-4 shadow-card backdrop-blur-xl sm:rounded-[1.75rem] sm:px-5 md:px-6 md:py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/35">Cash Management</p>
        <h1 className="text-[1.6rem] font-display font-bold leading-tight text-ink sm:text-2xl md:text-[1.85rem]">Shift Reconciliation</h1>
        <p className="text-sm font-medium text-slate-500">Open, monitor, and close till shifts. All cash counts are audited. One open shift per till.</p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm font-medium">
          <Link href="/shifts/drawer" className="text-accent underline underline-offset-2">
            Cash drawer drill-down
          </Link>
          <Link href="/shifts/variance" className="text-accent underline underline-offset-2">
            Cash variance investigations
          </Link>
        </div>
      </div>

      <ShiftClient
        tills={tills}
        openShifts={openShiftSummaries}
        occupiedTills={occupiedTills}
        otherOpenShifts={otherOpenShiftSummaries}
        recentShifts={recentShifts.map((s) => ({
          id: s.id,
          tillName: s.till.name,
          userName: s.user.name,
          openedAt: s.openedAt.toISOString(),
          closedAt: s.closedAt?.toISOString() ?? null,
          status: s.status,
          salesCount: s._count.salesInvoices,
          openingCashPence: s.openingCashPence,
          expectedCashPence: s.expectedCashPence,
          actualCashPence: s.actualCashPence,
          variance: s.variance,
          closureNumber: s.closureNumber,
          cardTotalPence: s.cardTotalPence,
          transferTotalPence: s.transferTotalPence,
          momoTotalPence: s.momoTotalPence ?? 0,
          investigationId: s.cashVarianceInvestigation?.id ?? null,
          investigationStatus: s.cashVarianceInvestigation?.status ?? null,
        }))}
        currency={business.currency}
        userRole={user.role}
        currentUserId={user.id}
      />
    </div>
  );
}
