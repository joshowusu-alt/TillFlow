import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import SubmitButton from '@/components/SubmitButton';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime, formatDate } from '@/lib/format';
import { updateSupplierAction } from '@/app/actions/suppliers';

export default async function SupplierDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { from?: string; to?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const start = searchParams?.from ? new Date(searchParams.from) : undefined;
  const end = searchParams?.to ? new Date(searchParams.to) : undefined;

  const supplier = await prisma.supplier.findFirst({
    where: { id: params.id, businessId: business.id },
    include: {
      purchaseInvoices: {
        where: {
          ...(start ? { createdAt: { gte: start } } : {}),
          ...(end ? { createdAt: { lte: end } } : {})
        },
        select: {
          id: true,
          createdAt: true,
          dueDate: true,
          paymentStatus: true,
          totalPence: true,
          payments: {
            select: { id: true, amountPence: true, paidAt: true, method: true, notes: true },
            orderBy: { paidAt: 'asc' },
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 200
      }
    }
  });

  if (!supplier) {
    return <div className="card p-6">Supplier not found.</div>;
  }

  const invoices = supplier.purchaseInvoices.map((invoice) => {
    const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
    const isClosed = ['RETURNED', 'VOID'].includes(invoice.paymentStatus);
    const balance = isClosed ? 0 : Math.max(invoice.totalPence - paid, 0);
    return { ...invoice, paid, balance, isClosed };
  });

  const activeInvoices = invoices.filter((invoice) => !invoice.isClosed);
  const outstanding = activeInvoices.reduce((sum, invoice) => sum + invoice.balance, 0);
  const totalBilled = activeInvoices.reduce((sum, invoice) => sum + invoice.totalPence, 0);
  const totalPaid = activeInvoices.reduce((sum, invoice) => sum + invoice.paid, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={supplier.name} subtitle="Supplier profile and payable history." />

      <div className="card grid gap-4 p-6 md:grid-cols-3">
        <div className="space-y-2 text-sm">
          <div className="text-xs uppercase tracking-wide text-black/40">Contact</div>
          <div>Phone: {supplier.phone ?? '-'}</div>
          <div>Email: {supplier.email ?? '-'}</div>
          <div>Credit limit: {formatMoney(supplier.creditLimitPence, business.currency)}</div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="text-xs uppercase tracking-wide text-black/40">Balance</div>
          <div className="text-2xl font-semibold">{formatMoney(outstanding, business.currency)}</div>
          <div className="text-black/50">{invoices.length} invoices</div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="text-xs uppercase tracking-wide text-black/40">Last Purchase</div>
          <div>
            {invoices[0]?.createdAt ? formatDateTime(invoices[0].createdAt) : 'No purchases yet'}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Edit supplier</h2>
        <form action={updateSupplierAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <input type="hidden" name="id" value={supplier.id} />
          <input className="input" name="name" defaultValue={supplier.name} required />
          <input className="input" name="phone" defaultValue={supplier.phone ?? ''} placeholder="Phone" />
          <input className="input" name="email" defaultValue={supplier.email ?? ''} placeholder="Email" />
          <input
            className="input"
            name="creditLimit"
            defaultValue={(supplier.creditLimitPence / 100).toFixed(2)}
            placeholder="Credit limit"
          />
          <div className="md:col-span-3">
            <SubmitButton className="btn-primary" loadingText="Saving…">Save changes</SubmitButton>
          </div>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Purchase history</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-4">
          <div>
            <label className="label">From</label>
            <input className="input" name="from" type="date" defaultValue={start?.toISOString().slice(0, 10)} />
          </div>
          <div>
            <label className="label">To</label>
            <input className="input" name="to" type="date" defaultValue={end?.toISOString().slice(0, 10)} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full">Filter</button>
          </div>
          <div className="flex items-end">
            <DownloadLink
              className="btn-ghost w-full text-xs"
              href={`/suppliers/${supplier.id}/statement?from=${start?.toISOString().slice(0, 10) ?? ''}&to=${
                end?.toISOString().slice(0, 10) ?? ''
              }`}
              fallbackFilename={`supplier-statement-${supplier.id.slice(0, 8)}.csv`}
            >
              Download CSV
            </DownloadLink>
          </div>
        </form>
        <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            Total billed: {formatMoney(totalBilled, business.currency)}
          </div>
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            Total paid: {formatMoney(totalPaid, business.currency)}
          </div>
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            Balance: {formatMoney(outstanding, business.currency)}
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="table mt-4 w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Purchased</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Total</th>
              <th>Balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => {
              const now = new Date();
              const isOverdue = !invoice.isClosed && invoice.dueDate && invoice.dueDate < now;
              const isDueSoon = !isOverdue && !invoice.isClosed && invoice.dueDate && (invoice.dueDate.getTime() - now.getTime()) < 3 * 86400000;
              return (
                <>
                  <tr key={invoice.id} className="rounded-xl bg-white">
                    <td className="px-3 py-3 text-sm">
                      <Link href={`/purchases/${invoice.id}`} className="font-mono text-xs hover:underline">
                        {invoice.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-sm text-black/60">{formatDateTime(invoice.createdAt)}</td>
                    <td className="px-3 py-3 text-sm">
                      {invoice.dueDate ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          isOverdue
                            ? 'bg-red-100 text-red-700'
                            : isDueSoon
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-black/5 text-black/60'
                        }`}>
                          {isOverdue ? 'Overdue · ' : ''}{formatDate(invoice.dueDate)}
                        </span>
                      ) : <span className="text-black/30">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="pill bg-black/5 text-black/60">{invoice.paymentStatus}</span>
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold">
                      {formatMoney(invoice.totalPence, business.currency)}
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold">
                      {formatMoney(invoice.balance, business.currency)}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      {!invoice.isClosed && invoice.balance > 0 && (
                        <Link href={`/payments/supplier-payments`} className="btn-ghost text-xs">
                          Pay
                        </Link>
                      )}
                    </td>
                  </tr>
                  {invoice.payments.length > 0 && (
                    <tr key={`${invoice.id}-payments`} className="bg-transparent">
                      <td colSpan={7} className="px-3 pb-3 pt-0">
                        <div className="rounded-xl border border-black/5 bg-black/[0.02] px-3 py-2">
                          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-black/40">Payment history</div>
                          <div className="space-y-1">
                            {invoice.payments.map((payment) => (
                              <div key={payment.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-black/70">
                                <span className="font-semibold">{formatMoney(payment.amountPence, business.currency)}</span>
                                <span>{payment.method}</span>
                                <span className="text-black/40">{formatDate(payment.paidAt)}</span>
                                {payment.notes && <span className="text-black/40">{payment.notes}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
