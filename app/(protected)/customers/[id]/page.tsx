import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import SubmitButton from '@/components/SubmitButton';
import ResponsiveDataTable from '@/components/ResponsiveDataTable';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime, formatDate } from '@/lib/format';
import { computeOutstandingBalance } from '@/lib/accounting';
import Link from 'next/link';
import { updateCustomerAction } from '@/app/actions/customers';
import { getFeatures } from '@/lib/features';

export default async function CustomerDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { from?: string; to?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any
  );
  const loyaltyEnabled = features.loyaltyPoints && (business as any).loyaltyEnabled;

  const start = searchParams?.from ? new Date(searchParams.from) : undefined;
  const end = searchParams?.to ? new Date(searchParams.to) : undefined;

  const customer = await prisma.customer.findFirst({
    where: { id: params.id, businessId: business.id },
    include: {
      salesInvoices: {
        where: {
          ...(start ? { createdAt: { gte: start } } : {}),
          ...(end ? { createdAt: { lte: end } } : {})
        },
        select: {
          id: true,
          createdAt: true,
          paymentStatus: true,
          totalPence: true,
          payments: {
            select: { id: true, amountPence: true, receivedAt: true, method: true, reference: true },
            orderBy: { receivedAt: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 200
      }
    }
  });

  if (!customer) {
    return <div className="card p-6">Customer not found.</div>;
  }

  const invoices = customer.salesInvoices.map((invoice) => {
    const balance = computeOutstandingBalance(invoice);
    const isClosed = ['RETURNED', 'VOID'].includes(invoice.paymentStatus);
    const paid = invoice.payments.reduce((sum, p) => sum + p.amountPence, 0);
    const effectivePaid = !isClosed && invoice.paymentStatus === 'PAID' ? invoice.totalPence : paid;
    return { ...invoice, paid, effectivePaid, balance, isClosed };
  });

  const activeInvoices = invoices.filter((invoice) => !invoice.isClosed);
  const outstanding = activeInvoices.reduce((sum, invoice) => sum + invoice.balance, 0);
  const totalBilled = activeInvoices.reduce((sum, invoice) => sum + invoice.totalPence, 0);
  const totalPaid = activeInvoices.reduce((sum, invoice) => sum + invoice.effectivePaid, 0);
  const ledgerRows = invoices
    .flatMap((invoice) => {
      const settlementAdjustment = !invoice.isClosed && invoice.paymentStatus === 'PAID' && invoice.paid < invoice.totalPence
        ? [{
            key: `${invoice.id}-status-settled`,
            date: invoice.createdAt,
            description: 'Marked paid without receipt row',
            debitPence: 0,
            creditPence: invoice.totalPence - invoice.paid,
          }]
        : [];

      return [{
        key: `${invoice.id}-invoice`,
        date: invoice.createdAt,
        description: `Sale ${invoice.id.slice(0, 8)}`,
        debitPence: invoice.isClosed ? 0 : invoice.totalPence,
        creditPence: 0,
      },
      ...invoice.payments.map((payment) => ({
        key: payment.id,
        date: payment.receivedAt,
        description: `${payment.method} receipt${payment.reference ? ` - ${payment.reference}` : ''}`,
        debitPence: 0,
        creditPence: payment.amountPence,
      })),
      ...settlementAdjustment,
      ];
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .reduce<Array<{
      key: string;
      date: Date;
      description: string;
      debitPence: number;
      creditPence: number;
      balancePence: number;
    }>>((rows, row) => {
      const previousBalance = rows.at(-1)?.balancePence ?? 0;
      rows.push({ ...row, balancePence: Math.max(previousBalance + row.debitPence - row.creditPence, 0) });
      return rows;
    }, []);

  return (
    <div className="space-y-6">
      <PageHeader title={customer.name} subtitle="Customer profile and transaction history." />

      <div className="card grid gap-4 p-6 md:grid-cols-3">
        <div className="space-y-2 text-sm">
          <div className="text-xs uppercase tracking-wide text-black/40">Contact</div>
          <div>Phone: {customer.phone ?? '-'}</div>
          <div>Email: {customer.email ?? '-'}</div>
          <div>Credit limit: {formatMoney(customer.creditLimitPence, business.currency)}</div>
          {loyaltyEnabled && (
            <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">Loyalty points</div>
              <div className="text-xl font-bold text-amber-700 tabular-nums">
                {((customer as any).loyaltyPointsBalance ?? 0).toLocaleString()}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2 text-sm">
          <div className="text-xs uppercase tracking-wide text-black/40">Balance</div>
          <div className="text-2xl font-semibold">{formatMoney(outstanding, business.currency)}</div>
          <div className="text-black/50">{invoices.length} invoices</div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="text-xs uppercase tracking-wide text-black/40">Last Sale</div>
          <div>
            {invoices[0]?.createdAt ? formatDateTime(invoices[0].createdAt) : 'No sales yet'}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Edit customer</h2>
        <form action={updateCustomerAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <input type="hidden" name="id" value={customer.id} />
          <input className="input" name="name" defaultValue={customer.name} required />
          <input className="input" name="phone" defaultValue={customer.phone ?? ''} placeholder="Phone" />
          <input className="input" name="email" defaultValue={customer.email ?? ''} placeholder="Email" />
          <input
            className="input"
            name="creditLimit"
            defaultValue={(customer.creditLimitPence / 100).toFixed(2)}
            placeholder="Credit limit"
          />
          <div className="md:col-span-3">
            <SubmitButton className="btn-primary" loadingText="Saving…">Save changes</SubmitButton>
          </div>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Invoice history</h2>
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
              href={`/customers/${customer.id}/statement?from=${start?.toISOString().slice(0, 10) ?? ''}&to=${
                end?.toISOString().slice(0, 10) ?? ''
              }`}
              fallbackFilename={`customer-statement-${customer.id.slice(0, 8)}.csv`}
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
        <ResponsiveDataTable
          desktop={
            <div className="responsive-table-shell">
              <table className="table mt-4 w-full min-w-[48rem] border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Balance</th>
                    <th>Receipt</th>
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
                      <td className="px-3 py-3">
                        <Link className="btn-ghost text-xs" href={`/receipts/${invoice.id}`}>
                          Print
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-black/50">
                        No invoices found for this date range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          }
        />
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Statement ledger</h2>
        <p className="mt-1 text-sm text-black/50">Sales increase the customer balance; receipts reduce it.</p>
        <div className="responsive-table-shell mt-4">
          <table className="table w-full min-w-[48rem] border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Invoice</th>
                <th>Receipt</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.slice(-80).map((row) => (
                <tr key={row.key} className="rounded-xl bg-white">
                  <td className="px-3 py-3 text-sm text-black/60">{formatDate(row.date)}</td>
                  <td className="px-3 py-3 text-sm">{row.description}</td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {row.debitPence > 0 ? formatMoney(row.debitPence, business.currency) : '-'}
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {row.creditPence > 0 ? formatMoney(row.creditPence, business.currency) : '-'}
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold">{formatMoney(row.balancePence, business.currency)}</td>
                </tr>
              ))}
              {ledgerRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-black/50">No ledger activity yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
