import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';
import { summarizeOpenPayables } from '@/lib/reports/surface-balances';
import { localDateInstant } from '@/lib/reports/reporting-clock';

const csvEscape = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const formatPence = (pence: number) => (pence / 100).toFixed(2);

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getUser();
  if (!user || !['MANAGER', 'OWNER'].includes(user.role)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: { timezone: true },
  });
  const start = localDateInstant(from, 'start', business?.timezone);
  const endExclusive = localDateInstant(to, 'endExclusive', business?.timezone);

  const supplier = await prisma.supplier.findFirst({
    where: { id: params.id, businessId: user.businessId },
    include: {
      purchaseInvoices: {
        where: {
          ...((start || endExclusive)
            ? { createdAt: { ...(start ? { gte: start } : {}), ...(endExclusive ? { lt: endExclusive } : {}) } }
            : {})
        },
        include: { payments: true },
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!supplier) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  }

  const invoices = supplier.purchaseInvoices.map((invoice) => {
    const document = payableDocumentBalance({
      paymentStatus: invoice.paymentStatus,
      totalPence: invoice.totalPence,
      payments: invoice.payments,
    });
    const isClosed = ['RETURNED', 'VOID'].includes(invoice.paymentStatus);
    return { ...invoice, paid: document.paidPence, balance: document.balancePence, excess: document.excessPence, isClosed };
  });

  const activeInvoices = invoices.filter((invoice) => !invoice.isClosed);
  const totalBilled = activeInvoices.reduce((sum, invoice) => sum + invoice.totalPence, 0);
  const totalPaid = activeInvoices.reduce((sum, invoice) => sum + invoice.paid, 0);
  const outstanding = summarizeOpenPayables(supplier.purchaseInvoices).outstandingPence;

  const rows: string[] = [];
  rows.push(`Supplier,${csvEscape(supplier.name)}`);
  rows.push(`Generated,${csvEscape(new Date().toISOString())}`);
  rows.push(`Period,${csvEscape(from ?? '')},${csvEscape(to ?? '')}`);
  rows.push('');
  rows.push('Invoice,Date,Status,Total,Paid,Balance');
  for (const invoice of invoices) {
    rows.push(
      [
        csvEscape(invoice.id.slice(0, 8)),
        csvEscape(invoice.createdAt.toISOString()),
        csvEscape(invoice.paymentStatus),
        csvEscape(formatPence(invoice.totalPence)),
        csvEscape(formatPence(invoice.paid)),
        csvEscape(formatPence(invoice.balance))
      ].join(',')
    );
  }
  rows.push('');
  rows.push('Summary,Total billed,Total paid,Balance');
  rows.push(
    [
      csvEscape('Totals'),
      csvEscape(formatPence(totalBilled)),
      csvEscape(formatPence(totalPaid)),
      csvEscape(formatPence(outstanding))
    ].join(',')
  );

  const csv = rows.join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="supplier-statement-${supplier.id.slice(0, 8)}.csv"`
    }
  });
}
