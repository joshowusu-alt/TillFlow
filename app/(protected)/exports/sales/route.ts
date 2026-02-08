import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser } from '../_shared';

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const sales = await prisma.salesInvoice.findMany({
    where: { businessId: user.businessId },
    include: {
      customer: true,
      store: true,
      payments: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const rows: string[] = [];
  rows.push('Invoice,Date,Store,Customer,Status,Subtotal,VAT,Total,Paid');
  for (const sale of sales) {
    const paid = sale.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
    rows.push(
      [
        csvEscape(sale.id.slice(0, 8)),
        csvEscape(sale.createdAt.toISOString()),
        csvEscape(sale.store?.name ?? ''),
        csvEscape(sale.customer?.name ?? 'Walk-in'),
        csvEscape(sale.paymentStatus),
        csvEscape(formatPence(sale.subtotalPence)),
        csvEscape(formatPence(sale.vatPence)),
        csvEscape(formatPence(sale.totalPence)),
        csvEscape(formatPence(paid))
      ].join(',')
    );
  }

  const csv = rows.join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="sales.csv"'
    }
  });
}
