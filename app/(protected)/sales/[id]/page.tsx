import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import RemainingBalance from '@/components/RemainingBalance';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDateTime, formatMoney } from '@/lib/format';
import { displayDocumentNumber } from '@/lib/reliability/walkthrough-contracts';

export const dynamic = 'force-dynamic';

export default async function SaleDetailPage({ params }: { params: { id: string } }) {
  const { business } = await requireBusiness();
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: params.id, businessId: business.id },
    include: {
      lines: { include: { product: { select: { name: true } }, unit: { select: { name: true } } } },
      payments: { orderBy: { receivedAt: 'asc' } },
      customer: { select: { name: true } },
      store: { select: { name: true } },
    },
  });
  if (!invoice) notFound();

  const paidPence = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={displayDocumentNumber('invoice', invoice.transactionNumber, invoice.id)}
        subtitle={`Read-only sale detail · ${invoice.store.name}`}
        actions={
          <Link className="btn-secondary text-xs" href="/sales">
            Back to sales
          </Link>
        }
      />
      <div className="card space-y-3 p-5">
        <div className="text-sm text-black/60">{formatDateTime(invoice.createdAt)}</div>
        <div className="text-sm">Customer: {invoice.customer?.name ?? 'Walk-in'}</div>
        <div className="text-sm">Status: {invoice.paymentStatus}</div>
        <RemainingBalance
          amountPence={invoice.totalPence}
          paidPence={paidPence}
          currency={business.currency}
        />
      </div>
      <div className="card p-5">
        <h2 className="text-lg font-semibold">Lines</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {invoice.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3">
              <span>
                {line.product.name} · {line.qtyInUnit} {line.unit.name}
              </span>
              <span className="tabular-nums">{formatMoney(line.lineTotalPence, business.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between text-sm font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(invoice.totalPence, business.currency)}</span>
        </div>
      </div>
      <div className="card p-5">
        <h2 className="text-lg font-semibold">Receipts</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {invoice.payments.map((payment) => (
            <li key={payment.id} className="flex justify-between gap-3">
              <span>
                {displayDocumentNumber('customer_receipt', payment.transactionNumber, payment.id)} ·{' '}
                {payment.method} · {payment.receiptOrigin ?? 'Historic'}
              </span>
              <span className="tabular-nums">{formatMoney(payment.amountPence, business.currency)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
