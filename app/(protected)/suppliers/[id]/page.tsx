import PageHeader from '@/components/PageHeader';
import SubmitButton from '@/components/SubmitButton';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import { updateSupplierAction } from '@/app/actions/suppliers';

export default async function SupplierDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { from?: string; to?: string };
}) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const start = searchParams?.from ? new Date(searchParams.from) : undefined;
  const end = searchParams?.to ? new Date(searchParams.to) : undefined;

  const supplier = await prisma.supplier.findUnique({
    where: { id: params.id },
    include: {
      purchaseInvoices: {
        where: {
          ...(start ? { createdAt: { gte: start } } : {}),
          ...(end ? { createdAt: { lte: end } } : {})
        },
        include: { payments: true },
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
            <a
              className="btn-ghost w-full text-xs"
              href={`/suppliers/${supplier.id}/statement?from=${start?.toISOString().slice(0, 10) ?? ''}&to=${
                end?.toISOString().slice(0, 10) ?? ''
              }`}
            >
              Download CSV
            </a>
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
        <table className="table mt-4 w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Status</th>
              <th>Total</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="rounded-xl bg-white">
                <td className="px-3 py-3 text-sm">{invoice.id.slice(0, 8)}</td>
                <td className="px-3 py-3 text-sm">{formatDateTime(invoice.createdAt)}</td>
                <td className="px-3 py-3">
                  <span className="pill bg-black/5 text-black/60">{invoice.paymentStatus}</span>
                </td>
                <td className="px-3 py-3 text-sm font-semibold">
                  {formatMoney(invoice.totalPence, business.currency)}
                </td>
                <td className="px-3 py-3 text-sm font-semibold">
                  {formatMoney(invoice.balance, business.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
