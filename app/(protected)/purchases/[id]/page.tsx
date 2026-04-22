import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import SubmitButton from '@/components/SubmitButton';
import FormError from '@/components/FormError';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime, formatDate } from '@/lib/format';
import { recordSupplierPaymentAction } from '@/app/actions/payments';

export default async function PurchaseInvoicePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { id: params.id, businessId: business.id },
    include: {
      supplier: { select: { id: true, name: true, phone: true, email: true } },
      store: { select: { name: true } },
      lines: {
        include: {
          product: { select: { name: true } },
          unit: { select: { name: true, pluralName: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      payments: {
        include: { recordedBy: { select: { name: true } } },
        orderBy: { paidAt: 'asc' },
      },
    },
  });

  if (!invoice) return <div className="card p-6">Invoice not found.</div>;

  const totalPaid = invoice.payments.reduce((s, p) => s + p.amountPence, 0);
  const outstanding = Math.max(invoice.totalPence - totalPaid, 0);
  const isClosed = ['RETURNED', 'VOID'].includes(invoice.paymentStatus);
  const now = new Date();
  const isOverdue = !isClosed && invoice.dueDate && invoice.dueDate < now;
  const isDueSoon = !isOverdue && !isClosed && invoice.dueDate && (invoice.dueDate.getTime() - now.getTime()) < 3 * 86400000;
  const today = now.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Purchase Invoice`}
        subtitle={invoice.supplier ? `Supplier: ${invoice.supplier.name}` : 'No supplier linked'}
      />

      <FormError error={searchParams?.error} />

      {/* Summary card */}
      <div className="card grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Purchased</div>
          <div className="text-sm font-medium">{formatDateTime(invoice.createdAt)}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Due Date</div>
          {invoice.dueDate ? (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              isOverdue
                ? 'bg-red-100 text-red-700'
                : isDueSoon
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-black/5 text-black/60'
            }`}>
              {isOverdue ? 'Overdue · ' : ''}{formatDate(invoice.dueDate)}
            </span>
          ) : <div className="text-sm text-black/40">No due date</div>}
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Status</div>
          <span className="pill bg-black/5 text-black/60">{invoice.paymentStatus}</span>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Store</div>
          <div className="text-sm">{invoice.store?.name ?? '—'}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Invoice Total</div>
          <div className="text-2xl font-semibold">{formatMoney(invoice.totalPence, business.currency)}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Total Paid</div>
          <div className="text-2xl font-semibold text-emerald-700">{formatMoney(totalPaid, business.currency)}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wider text-black/40">Outstanding</div>
          <div className={`text-2xl font-semibold ${outstanding > 0 ? 'text-red-600' : 'text-black/40'}`}>
            {formatMoney(outstanding, business.currency)}
          </div>
        </div>
        {invoice.supplier && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-black/40">Supplier</div>
            <Link href={`/suppliers/${invoice.supplier.id}`} className="text-sm hover:underline">
              {invoice.supplier.name}
            </Link>
            {invoice.supplier.phone && <div className="text-xs text-black/50">{invoice.supplier.phone}</div>}
          </div>
        )}
      </div>

      {/* Invoice lines */}
      <div className="card p-6">
        <h2 className="text-base font-semibold">Items purchased</h2>
        <div className="overflow-x-auto">
          <table className="table mt-4 w-full border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th className="text-right">Unit Cost</th>
                <th className="text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id} className="rounded-xl bg-white">
                  <td className="px-3 py-2">{line.product.name}</td>
                  <td className="px-3 py-2">{line.qtyInUnit} {line.unit.name}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(line.unitCostPence, business.currency)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(line.lineTotalPence, business.currency)}</td>
                </tr>
              ))}
              <tr className="bg-black/[0.02]">
                <td colSpan={3} className="px-3 py-2 text-right text-xs uppercase tracking-wider text-black/40">Total (incl. VAT)</td>
                <td className="px-3 py-2 text-right text-sm font-bold">{formatMoney(invoice.totalPence, business.currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment history */}
      <div className="card p-6">
        <h2 className="text-base font-semibold">Payment history</h2>
        {invoice.payments.length === 0 ? (
          <p className="mt-3 text-sm text-black/50">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table mt-4 w-full border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th className="text-right">Amount</th>
                  <th>Notes</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((payment) => (
                  <tr key={payment.id} className="rounded-xl bg-white">
                    <td className="px-3 py-2">{formatDate(payment.paidAt)}</td>
                    <td className="px-3 py-2">{payment.method}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(payment.amountPence, business.currency)}</td>
                    <td className="px-3 py-2 text-black/50">{payment.notes ?? '—'}</td>
                    <td className="px-3 py-2 text-black/50">{payment.recordedBy?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Record payment form */}
        {!isClosed && outstanding > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold">Record a payment</h3>
            <form action={recordSupplierPaymentAction} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <input type="hidden" name="returnTo" value={`/purchases/${invoice.id}`} />
              <div>
                <label className="label">Method</label>
                <select className="input" name="paymentMethod" defaultValue="CASH">
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>
              <div>
                <label className="label">Amount</label>
                <input
                  className="input"
                  name="amount"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder={(outstanding / 100).toFixed(2)}
                />
              </div>
              <div>
                <label className="label">Payment date</label>
                <input className="input" name="paidAt" type="date" defaultValue={today} />
              </div>
              <div>
                <label className="label">Notes (optional)</label>
                <input className="input" name="notes" type="text" placeholder="e.g. cheque #1234" />
              </div>
              <div className="flex items-end sm:col-span-2 lg:col-span-4">
                <SubmitButton className="btn-primary" loadingText="Recording…">Record payment</SubmitButton>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Link href="/purchases" className="btn-ghost text-sm">← Back to purchases</Link>
        {invoice.supplier && (
          <Link href={`/suppliers/${invoice.supplier.id}`} className="btn-ghost text-sm">
            View supplier
          </Link>
        )}
        <Link href="/payments/supplier-payments" className="btn-ghost text-sm">
          All outstanding payables
        </Link>
      </div>
    </div>
  );
}
