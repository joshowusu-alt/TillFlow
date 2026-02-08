import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth';

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
  const start = from ? new Date(from) : undefined;
  const end = to ? new Date(to) : undefined;
  if (start) start.setHours(0, 0, 0, 0);
  if (end) end.setHours(23, 59, 59, 999);

  const customer = await prisma.customer.findFirst({
    where: { id: params.id, businessId: user.businessId },
    include: {
      salesInvoices: {
        where: {
          ...(start ? { createdAt: { gte: start } } : {}),
          ...(end ? { createdAt: { lte: end } } : {})
        },
        include: { payments: true },
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  const invoices = customer.salesInvoices.map((invoice) => {
    const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
    const isClosed = ['RETURNED', 'VOID'].includes(invoice.paymentStatus);
    const balance = isClosed ? 0 : Math.max(invoice.totalPence - paid, 0);
    return { ...invoice, paid, balance, isClosed };
  });

  const activeInvoices = invoices.filter((invoice) => !invoice.isClosed);
  const totalBilled = activeInvoices.reduce((sum, invoice) => sum + invoice.totalPence, 0);
  const totalPaid = activeInvoices.reduce((sum, invoice) => sum + invoice.paid, 0);
  const outstanding = activeInvoices.reduce((sum, invoice) => sum + invoice.balance, 0);

  const rows: string[] = [];
  rows.push(`Customer,${csvEscape(customer.name)}`);
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
      'Content-Disposition': `attachment; filename="customer-statement-${customer.id.slice(0, 8)}.csv"`
    }
  });
}
