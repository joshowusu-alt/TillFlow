import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import ShiftClient from './ShiftClient';

export default async function ShiftsPage() {
  const { user, business, store: baseStore } = await requireBusinessStore();

  const isOwner = user.role === 'OWNER';

  // Run all queries in parallel — tills, open shift, and recent shifts
  const [tills, openShift, recentShifts] = await Promise.all([
    prisma.till.findMany({
      where: { storeId: baseStore.id },
      select: { id: true, name: true, active: true }
    }),
    prisma.shift.findFirst({
      where: { userId: user.id, status: 'OPEN' },
      select: {
        id: true,
        openedAt: true,
        openingCashPence: true,
        expectedCashPence: true,
        till: { select: { name: true } },
        cashDrawerEntries: {
          select: { entryType: true, amountPence: true }
        },
        salesInvoices: {
          select: {
            totalPence: true,
            payments: { select: { method: true, amountPence: true } }
          }
        }
      }
    }),
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
        cardTotalPence: true,
        transferTotalPence: true,
        momoTotalPence: true,
        user: { select: { name: true } },
        till: { select: { name: true } },
        _count: { select: { salesInvoices: true } }
      }
    }),
  ]);

  // Calculate open shift summary
  let openShiftSummary = null;
  if (openShift) {
    let cardTotal = 0;
    let transferTotal = 0;
    let momoTotal = 0;
    let salesCount = openShift.salesInvoices.length;
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

    openShiftSummary = {
      ...openShift,
      salesCount,
      salesTotal,
      expectedCash: openShift.expectedCashPence,
      cardTotal,
      transferTotal,
      momoTotal,
      cashByType
    };
  }

  // For owners: fetch open shifts belonging to other users on this store's tills
  let otherOpenShiftSummaries: {
    id: string;
    till: { name: string };
    userName: string;
    openedAt: string;
    openingCashPence: number;
    salesCount: number;
    salesTotal: number;
    expectedCash: number;
    cardTotal: number;
    transferTotal: number;
    momoTotal: number;
    cashByType?: Record<string, number>;
  }[] = [];

  if (isOwner) {
    const otherShifts = await prisma.shift.findMany({
      where: {
        status: 'OPEN',
        userId: { not: user.id },
        till: { storeId: baseStore.id },
      },
      select: {
        id: true,
        openedAt: true,
        openingCashPence: true,
        expectedCashPence: true,
        user: { select: { name: true } },
        till: { select: { name: true } },
        cashDrawerEntries: {
          select: { entryType: true, amountPence: true },
        },
        salesInvoices: {
          select: {
            totalPence: true,
            payments: { select: { method: true, amountPence: true } },
          },
        },
      },
    });

    otherOpenShiftSummaries = otherShifts.map((s) => {
      let cardTotal = 0;
      let transferTotal = 0;
      let momoTotal = 0;
      let salesTotal = 0;
      for (const inv of s.salesInvoices) {
        salesTotal += inv.totalPence;
        for (const p of inv.payments) {
          if (p.method === 'CARD') cardTotal += p.amountPence;
          if (p.method === 'TRANSFER') transferTotal += p.amountPence;
          if (p.method === 'MOBILE_MONEY') momoTotal += p.amountPence;
        }
      }
      const cashByType = s.cashDrawerEntries.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.entryType] = (acc[entry.entryType] ?? 0) + entry.amountPence;
        return acc;
      }, {});
      return {
        id: s.id,
        till: s.till,
        userName: s.user.name,
        openedAt: s.openedAt.toISOString(),
        openingCashPence: s.openingCashPence,
        salesCount: s.salesInvoices.length,
        salesTotal,
        expectedCash: s.expectedCashPence,
        cardTotal,
        transferTotal,
        momoTotal,
        cashByType,
      };
    });
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
        tills={tills}
        openShift={openShiftSummary}
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
          cardTotalPence: s.cardTotalPence,
          transferTotalPence: s.transferTotalPence,
          momoTotalPence: s.momoTotalPence ?? 0
        }))}
        currency={business.currency}
        userRole={user.role}
      />
    </div>
  );
}
