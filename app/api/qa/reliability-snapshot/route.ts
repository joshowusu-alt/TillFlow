import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function evidenceApiEnabled() {
  if (process.env.VERCEL_ENV === 'production') return false;
  return (
    process.env.VERCEL_ENV === 'preview' ||
    process.env.RELIABILITY_EVIDENCE_API === '1' ||
    process.env.NODE_ENV !== 'production'
  );
}

/**
 * Owner-only, Preview/local snapshot of recent till/shift/sale identity.
 * Never enabled on Vercel Production. No customer PII, no secrets.
 */
export async function GET() {
  if (!evidenceApiEnabled()) {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  const user = await getUser();
  if (!user || (user.role !== 'OWNER' && user.role !== 'MANAGER')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const invoices = await prisma.salesInvoice.findMany({
    where: { businessId: user.businessId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      transactionNumber: true,
      businessId: true,
      storeId: true,
      tillId: true,
      shiftId: true,
      cashierUserId: true,
      saleSource: true,
      totalPence: true,
      paymentStatus: true,
      till: { select: { name: true, active: true } },
      shift: {
        select: {
          id: true,
          status: true,
          tillId: true,
          expectedCashPence: true,
          cardTotalPence: true,
          transferTotalPence: true,
          momoTotalPence: true,
        },
      },
      payments: { select: { id: true, method: true, amountPence: true } },
    },
  });

  const shiftIds = [...new Set(invoices.map((row) => row.shiftId).filter(Boolean))] as string[];
  const drawers = shiftIds.length
    ? await prisma.cashDrawerEntry.findMany({
        where: { businessId: user.businessId, shiftId: { in: shiftIds } },
        select: {
          id: true,
          tillId: true,
          shiftId: true,
          entryType: true,
          amountPence: true,
          referenceType: true,
          referenceId: true,
        },
      })
    : [];

  const stock = invoices.length
    ? await prisma.stockMovement.findMany({
        where: {
          storeId: { in: [...new Set(invoices.map((row) => row.storeId))] },
          referenceType: 'SALES_INVOICE',
          referenceId: { in: invoices.map((row) => row.id) },
        },
        select: { id: true, referenceId: true, productId: true, qtyBase: true, storeId: true },
      })
    : [];

  return NextResponse.json({
    businessId: user.businessId,
    userId: user.id,
    invoices: invoices.map((invoice) => ({
      invoiceId: invoice.id,
      transactionNumber: invoice.transactionNumber,
      businessId: invoice.businessId,
      storeId: invoice.storeId,
      tillId: invoice.tillId,
      tillName: invoice.till?.name ?? null,
      shiftId: invoice.shiftId,
      shiftStatus: invoice.shift?.status ?? null,
      cashierUserId: invoice.cashierUserId,
      saleSource: invoice.saleSource,
      totalPence: invoice.totalPence,
      payments: invoice.payments,
      drawer: drawers.filter((row) => row.shiftId === invoice.shiftId),
      stockMovements: stock.filter((row) => row.referenceId === invoice.id),
    })),
  });
}
