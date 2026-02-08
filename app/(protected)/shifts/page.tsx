import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import ShiftClient from './ShiftClient';

export default async function ShiftsPage() {
  const user = await requireUser();
  const business = await prisma.business.findFirst();
  if (!business) return <div>Business not found</div>;

  const store = await prisma.store.findFirst({
    where: { businessId: business.id },
    include: { tills: true }
  });
  if (!store) return <div>Store not found</div>;

  // Get open shift for current user
  const openShift = await prisma.shift.findFirst({
    where: { userId: user.id, status: 'OPEN' },
    include: {
      till: { select: { name: true } },
      salesInvoices: { include: { payments: true } }
    }
  });

  // Get recent closed shifts
  const recentShifts = await prisma.shift.findMany({
    where: { till: { storeId: store.id } },
    orderBy: { openedAt: 'desc' },
    take: 10,
    include: {
      user: { select: { name: true } },
      till: { select: { name: true } },
      _count: { select: { salesInvoices: true } }
    }
  });

  // Calculate open shift summary
  let openShiftSummary = null;
  if (openShift) {
    let cashTotal = openShift.openingCashPence;
    let cardTotal = 0;
    let transferTotal = 0;
    let salesCount = openShift.salesInvoices.length;
    let salesTotal = 0;

    for (const invoice of openShift.salesInvoices) {
      salesTotal += invoice.totalPence;
      for (const payment of invoice.payments) {
        if (payment.method === 'CASH') cashTotal += payment.amountPence;
        if (payment.method === 'CARD') cardTotal += payment.amountPence;
        if (payment.method === 'TRANSFER') transferTotal += payment.amountPence;
      }
    }

    openShiftSummary = {
      ...openShift,
      salesCount,
      salesTotal,
      expectedCash: cashTotal,
      cardTotal,
      transferTotal
    };
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-black/40">Cash Management</div>
          <h1 className="text-2xl font-display font-semibold">Shift Reconciliation</h1>
        </div>
      </div>

      <ShiftClient
        tills={store.tills}
        openShift={openShiftSummary}
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
          cardTotalPence: s.cardTotalPence,
          transferTotalPence: s.transferTotalPence
        }))}
        currency={business.currency}
      />
    </div>
  );
}
