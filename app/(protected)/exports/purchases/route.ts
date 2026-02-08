import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser } from '../_shared';

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const purchases = await prisma.purchaseInvoice.findMany({
    where: { businessId: user.businessId },
    include: {
      supplier: true,
      store: true,
      payments: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const rows: string[] = [];
  rows.push('Invoice,Date,Store,Supplier,Status,Subtotal,VAT,Total,Paid');
  for (const purchase of purchases) {
    const paid = purchase.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
    rows.push(
      [
        csvEscape(purchase.id.slice(0, 8)),
        csvEscape(purchase.createdAt.toISOString()),
        csvEscape(purchase.store?.name ?? ''),
        csvEscape(purchase.supplier?.name ?? 'Default Supplier'),
        csvEscape(purchase.paymentStatus),
        csvEscape(formatPence(purchase.subtotalPence)),
        csvEscape(formatPence(purchase.vatPence)),
        csvEscape(formatPence(purchase.totalPence)),
        csvEscape(formatPence(paid))
      ].join(',')
    );
  }

  const csv = rows.join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="purchases.csv"'
    }
  });
}
