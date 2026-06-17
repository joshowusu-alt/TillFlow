import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import SubmitButton from '@/components/SubmitButton';
import ResponsiveDataTable from '@/components/ResponsiveDataTable';
import TagChips from '@/components/TagChips';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime, formatDate, formatRelativeDate } from '@/lib/format';
import { computeOutstandingBalance } from '@/lib/accounting';
import { parseTags } from '@/lib/contact-tags';
import Link from 'next/link';
import { updateCustomerAction } from '@/app/actions/customers';
import { getFeatures } from '@/lib/features';

type OnlineOrderHistoryRow = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  totalPence: number;
  publicToken: string;
};

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
  const storefrontSlug = ((business as any).storefrontSlug as string | null) ?? null;
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

  const customerTags = parseTags((customer as any).tagsJson ?? null);
  const customerNotes = ((customer as any).notes as string | null) ?? '';

  const [lifetimeStats, linkedStorefrontCustomers] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: {
        customerId: customer.id,
        paymentStatus: { notIn: ['VOID', 'RETURNED'] },
      },
      _sum: { totalPence: true },
      _max: { createdAt: true },
      _count: { _all: true },
    }),
    prisma.storefrontCustomer.findMany({
      where: { businessId: business.id, posCustomerId: customer.id },
      select: { id: true },
    }),
  ]);

  const onlineOrders: OnlineOrderHistoryRow[] = linkedStorefrontCustomers.length
    ? await prisma.onlineOrder.findMany({
        where: {
          customerId: { in: linkedStorefrontCustomers.map((s) => s.id) },
          status: { notIn: ['CANCELLED', 'PAYMENT_FAILED'] },
          ...(start ? { createdAt: { gte: start } } : {}),
          ...(end ? { createdAt: { lte: end } } : {}),
        },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          totalPence: true,
          publicToken: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    : [];

  const onlineLifetimeStats = linkedStorefrontCustomers.length
    ? await prisma.onlineOrder.aggregate({
        where: {
          customerId: { in: linkedStorefrontCustomers.map((s) => s.id) },
          status: { notIn: ['CANCELLED', 'PAYMENT_FAILED'] },
        },
        _sum: { totalPence: true },
        _max: { createdAt: true },
        _count: { _all: true },
      })
    : {
        _sum: { totalPence: 0 },
        _max: { createdAt: null },
        _count: { _all: 0 },
      };

  const inStoreSpentPence = lifetimeStats._sum.totalPence ?? 0;
  const onlineSpentPence = onlineLifetimeStats._sum.totalPence ?? 0;
  const lifetimeSpentPence = inStoreSpentPence + onlineSpentPence;
  const inStoreVisitCount = lifetimeStats._count._all;
  const onlineOrderCount = onlineLifetimeStats._count._all;
  const lifetimeSaleCount = inStoreVisitCount + onlineOrderCount;
  const lastSaleAt = [lifetimeStats._max.createdAt, onlineLifetimeStats._max.createdAt]
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

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

  // Last payment across all invoices in the current range
  const allPaymentsInRange = invoices.flatMap((inv) => inv.payments);
  const lastPaymentAt = allPaymentsInRange.length > 0
    ? allPaymentsInRange.reduce<Date | null>((latest, p) => {
        if (!latest) return p.receivedAt;
        return p.receivedAt > latest ? p.receivedAt : latest;
      }, null)
    : null;

  // Available credit
  const creditLimit = customer.creditLimitPence;
  const availableCredit = creditLimit > 0 ? creditLimit - outstanding : null;

  // Status
  const creditStatus: 'up-to-date' | 'balance-due' | 'over-limit' =
    outstanding === 0 ? 'up-to-date'
    : creditLimit > 0 && outstanding > creditLimit ? 'over-limit'
    : 'balance-due';

  const ledgerRows = invoices
    .flatMap((invoice) => {
      const settlementAdjustment = !invoice.isClosed && invoice.paymentStatus === 'PAID' && invoice.paid < invoice.totalPence
        ? [{
            key: `${invoice.id}-status-settled`,
            date: invoice.createdAt,
            sortKey: invoice.createdAt.getTime() + 0.5,
            type: 'adjustment' as const,
            description: 'Balance settled',
            debitPence: 0,
            creditPence: invoice.totalPence - invoice.paid,
          }]
        : [];

      return [{
        key: `${invoice.id}-invoice`,
        date: invoice.createdAt,
        sortKey: invoice.createdAt.getTime(),
        type: 'invoice' as const,
        description: 'Invoice',
        debitPence: invoice.isClosed ? 0 : invoice.totalPence,
        creditPence: 0,
      },
      ...invoice.payments.map((payment) => ({
        key: payment.id,
        date: payment.receivedAt,
        sortKey: payment.receivedAt.getTime() + 0.1,
        type: 'payment' as const,
        description: `Payment${payment.reference ? ` - ${payment.reference}` : ''} (${payment.method.toLowerCase().replace('_', ' ')})`,
        debitPence: 0,
        creditPence: payment.amountPence,
      })),
      ...settlementAdjustment,
      ];
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .reduce<Array<{
      key: string;
      date: Date;
      type: 'invoice' | 'payment' | 'adjustment';
      description: string;
      debitPence: number;
      creditPence: number;
      balancePence: number;
    }>>((rows, row) => {
      const previousBalance = rows.at(-1)?.balancePence ?? 0;
      const { sortKey: _sortKey, ...rest } = row;
      rows.push({ ...rest, balancePence: Math.max(previousBalance + row.debitPence - row.creditPence, 0) });
      return rows;
    }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        subtitle="Customer profile and account statement."
        secondaryCta={{ label: '← Back to customers', href: '/customers' }}
      />

      {/* Tags + status badge */}
      <div className="flex flex-wrap items-center gap-2 -mt-2">
        {customerTags.length > 0 ? <TagChips tags={customerTags} /> : null}
        {creditStatus === 'over-limit' && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">Over limit</span>
        )}
        {creditStatus === 'balance-due' && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Balance due</span>
        )}
        {creditStatus === 'up-to-date' && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Up to date</span>
        )}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <Link href={`/payments/customer-receipts?customerId=${customer.id}`} className="btn-primary text-sm">
          Record payment
        </Link>
        <Link href="/pos" className="btn-secondary text-sm">
          Create sale
        </Link>
        <DownloadLink
          className="btn-secondary text-sm"
          href={`/customers/${customer.id}/statement`}
          fallbackFilename={`customer-statement-${customer.id.slice(0, 8)}.csv`}
        >
          View statement (CSV)
        </DownloadLink>
      </div>

      {/* Summary cards */}
      <div className="card grid gap-4 p-5 sm:p-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-black/40">Balance due</div>
          <div className={`text-2xl font-semibold tabular-nums ${outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {formatMoney(outstanding, business.currency)}
          </div>
          {creditLimit > 0 && (
            <div className="text-xs text-black/50">
              Credit limit: {formatMoney(creditLimit, business.currency)}
              {availableCredit !== null && availableCredit < 0 && (
                <span className="ml-1 text-red-600">({formatMoney(Math.abs(availableCredit), business.currency)} over)</span>
              )}
              {availableCredit !== null && availableCredit >= 0 && (
                <span className="ml-1 text-black/40">· {formatMoney(availableCredit, business.currency)} available</span>
              )}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-black/40">Lifetime spend</div>
          <div className="text-2xl font-semibold tabular-nums">{formatMoney(lifetimeSpentPence, business.currency)}</div>
          <div className="text-xs text-black/50">
            {lifetimeSaleCount} {onlineOrderCount > 0 ? 'total interaction' : 'visit'}{lifetimeSaleCount === 1 ? '' : 's'}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-black/40">Last payment</div>
          <div className="text-base font-semibold text-ink">
            {lastPaymentAt ? formatRelativeDate(lastPaymentAt) : 'No payment yet'}
          </div>
          {lastPaymentAt ? <div className="text-xs text-black/50">{formatDate(lastPaymentAt)}</div> : null}
        </div>
        <div className="space-y-2 text-sm">
          <div className="text-xs uppercase tracking-wide text-black/40">Contact</div>
          <div>Phone: {customer.phone ?? '-'}</div>
          <div>Email: {customer.email ?? '-'}</div>
          {lastSaleAt ? <div className="text-xs text-black/50">Last visit: {formatRelativeDate(lastSaleAt)}</div> : null}
          {loyaltyEnabled && (
            <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">Loyalty points</div>
              <div className="text-xl font-bold text-amber-700 tabular-nums">
                {((customer as any).loyaltyPointsBalance ?? 0).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit customer */}
      <div className="card p-5 sm:p-6">
        <h2 className="text-lg font-display font-semibold">Edit customer</h2>
        <form action={updateCustomerAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <input type="hidden" name="id" value={customer.id} />
          <div>
            <label className="label">Name</label>
            <input className="input" name="name" defaultValue={customer.name} required />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" name="phone" defaultValue={customer.phone ?? ''} placeholder="Phone" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" name="email" defaultValue={customer.email ?? ''} placeholder="Email" />
          </div>
          <div>
            <label className="label">Credit limit</label>
            <input
              className="input"
              name="creditLimit"
              defaultValue={(customer.creditLimitPence / 100).toFixed(2)}
              placeholder="Credit limit"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Tags</label>
            <input
              className="input"
              name="tags"
              defaultValue={customerTags.join(', ')}
              placeholder="VIP, Wholesale, Net 30"
            />
            <div className="mt-1 text-xs text-black/50">
              Comma-separated. Use tags to group customers (e.g. VIP, Wholesale, Late payers).
            </div>
          </div>
          <div className="md:col-span-3">
            <label className="label">Notes</label>
            <textarea
              className="input min-h-20"
              name="notes"
              defaultValue={customerNotes}
              placeholder="Anything you want to remember about this customer."
            />
          </div>
          <div className="md:col-span-3">
            <SubmitButton className="btn-primary" loadingText="Saving…">Save changes</SubmitButton>
          </div>
        </form>
      </div>

      {/* Invoice history */}
      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Invoices</h2>
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
            Total invoiced: {formatMoney(totalBilled, business.currency)}
          </div>
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            Total paid: {formatMoney(totalPaid, business.currency)}
          </div>
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            Balance due: {formatMoney(outstanding, business.currency)}
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

      {/* Statement */}
      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Statement</h2>
        <p className="mt-1 text-sm text-black/50">Invoices increase the balance; payments reduce it.</p>
        <div className="responsive-table-shell mt-4">
          <table className="table w-full min-w-[48rem] border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Invoice</th>
                <th>Payment</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.slice(-80).map((row) => (
                <tr key={row.key} className="rounded-xl bg-white">
                  <td className="px-3 py-3 text-sm text-black/60">{formatDate(row.date)}</td>
                  <td className="px-3 py-3 text-sm">
                    <span className={row.type === 'payment' ? 'text-emerald-700' : row.type === 'invoice' ? 'text-ink' : 'text-black/50'}>
                      {row.description}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {row.debitPence > 0 ? formatMoney(row.debitPence, business.currency) : '-'}
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold text-emerald-700">
                    {row.creditPence > 0 ? formatMoney(row.creditPence, business.currency) : '-'}
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold">{formatMoney(row.balancePence, business.currency)}</td>
                </tr>
              ))}
              {ledgerRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-black/50">No statement activity yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Online orders */}
      {onlineOrderCount > 0 ? (
        <div className="card p-6">
          <h2 className="text-lg font-display font-semibold">Online orders</h2>
          <p className="mt-1 text-sm text-black/50">Storefront orders linked to this customer profile.</p>
          <div className="responsive-table-shell mt-4">
            <table className="table w-full min-w-[48rem] border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Fulfillment</th>
                  <th>Total</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {onlineOrders.map((order) => (
                  <tr key={order.id} className="rounded-xl bg-white">
                    <td className="px-3 py-3 text-sm font-semibold">{order.orderNumber}</td>
                    <td className="px-3 py-3 text-sm text-black/60">{formatDateTime(order.createdAt)}</td>
                    <td className="px-3 py-3 text-sm"><span className="pill bg-black/5 text-black/70">{order.status}</span></td>
                    <td className="px-3 py-3 text-sm"><span className="pill bg-black/5 text-black/70">{order.paymentStatus}</span></td>
                    <td className="px-3 py-3 text-sm"><span className="pill bg-black/5 text-black/70">{order.fulfillmentStatus}</span></td>
                    <td className="px-3 py-3 text-sm font-semibold tabular-nums">{formatMoney(order.totalPence, business.currency)}</td>
                    <td className="px-3 py-3 text-sm">
                      {storefrontSlug ? (
                        <Link
                          className="btn-ghost text-xs"
                          href={`/shop/${storefrontSlug}/orders/${order.id}?token=${order.publicToken}`}
                        >
                          View
                        </Link>
                      ) : (
                        <span className="text-xs text-black/40">Unavailable</span>
                      )}
                    </td>
                  </tr>
                ))}
                {onlineOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-black/50">
                      No online orders in this date range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
