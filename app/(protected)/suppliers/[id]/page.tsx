import PageHeader from '@/components/PageHeader';
import AccountSection from '@/components/people/AccountSection';
import DownloadLink from '@/components/DownloadLink';
import SubmitButton from '@/components/SubmitButton';
import TagChips from '@/components/TagChips';
import Link from 'next/link';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { formatMoney, formatDateTime, formatDate, formatRelativeDate } from '@/lib/format';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';
import { getSupplierAccountSummary } from '@/lib/services/supplier-account-summary';
import { parseTags } from '@/lib/contact-tags';
import { updateSupplierAction } from '@/app/actions/suppliers';
import DueDateBadge from '@/components/DueDateBadge';
import SetPurchaseDueDateButton from '@/components/SetPurchaseDueDateButton';
import RemainingBalance from '@/components/RemainingBalance';
import { getSupplierSalesReport } from '@/lib/reports/supplier-sales';
import { businessMonthWindow, localDateInstant } from '@/lib/reports/reporting-clock';
import { displayDocumentNumber } from '@/lib/reliability/walkthrough-contracts';

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  TRANSFER: 'Bank Transfer',
  MOBILE_MONEY: 'Mobile Money (MoMo)',
};

const STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Unpaid',
  PART_PAID: 'Partially paid',
  PAID: 'Paid',
  VOID: 'Voided',
  RETURNED: 'Returned',
};

function SupplierStatusBadge({ status }: { status: 'up-to-date' | 'amount-owed' | 'over-limit' | 'credit-balance' }) {
  if (status === 'credit-balance') return <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Supplier credit</span>;
  if (status === 'over-limit') {
    return <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">Over limit</span>;
  }
  if (status === 'amount-owed') {
    return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Amount owed</span>;
  }
  return <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Up to date</span>;
}

function AccountStatCard({ label, value, helper }: { label: string; value: ReactNode; helper?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">{label}</div>
      <div className="mt-2 text-lg font-bold tabular-nums text-ink">{value}</div>
      {helper ? <div className="mt-1 text-xs text-black/50">{helper}</div> : null}
    </div>
  );
}

export default async function SupplierDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { from?: string; to?: string; historyPage?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any,
  );

  const start = localDateInstant(searchParams?.from, 'start', business.timezone);
  const endExclusive = localDateInstant(searchParams?.to, 'endExclusive', business.timezone);

  const parsedHistoryPage = Number(searchParams?.historyPage ?? 1);
  const historyPage = Number.isSafeInteger(parsedHistoryPage) && parsedHistoryPage > 0 ? Math.min(parsedHistoryPage, 100000) : 1;
  const historyPageSize = 25;
  const historyOffset = (historyPage - 1) * historyPageSize;

  const month = businessMonthWindow(new Date(), business.timezone);
  const mtdStart = month.startInclusive;
  const mtdEndExclusive = month.endExclusive;

  const [supplier, linkedProducts, supplierSales, balances] = await Promise.all([
    prisma.supplier.findFirst({
      where: { id: params.id, businessId: business.id },
      include: {
        purchaseInvoices: {
          where: {
            ...((start || endExclusive)
              ? { createdAt: { ...(start ? { gte: start } : {}), ...(endExclusive ? { lt: endExclusive } : {}) } }
              : {})
          },
          select: {
            id: true,
            transactionNumber: true,
            createdAt: true,
            dueDate: true,
            paymentStatus: true,
            totalPence: true, returnCreditPence: true,
            returnCredits: { select: { id: true, createdAt: true, creditPence: true, reason: true } },
            payments: {
              select: { id: true, amountPence: true, paidAt: true, method: true, notes: true },
              orderBy: { paidAt: 'asc' },
            }
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: historyOffset,
          take: historyPageSize
        }
      }
    }),
    prisma.product.findMany({
      where: {
        businessId: business.id,
        preferredSupplierId: params.id,
      },
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPriceBasePence: true,
        defaultCostBasePence: true,
        inventoryBalances: {
          select: { qtyOnHandBase: true },
        },
      },
      orderBy: { name: 'asc' },
      take: 50,
    }),
    features.advancedReports
      ? getSupplierSalesReport(business.id, { start: mtdStart, end: mtdEndExclusive, supplierId: params.id })
      : Promise.resolve(null),
    getSupplierAccountSummary(business.id, params.id, { start, endExclusive }),
  ]);

  if (!supplier) {
    return <div className="card p-6">Supplier not found.</div>;
  }

  const supplierTags = parseTags((supplier as any).tagsJson ?? null);
  const supplierNotes = ((supplier as any).notes as string | null) ?? '';

  const invoices = supplier.purchaseInvoices.map((invoice) => {
    const document = payableDocumentBalance(invoice);
    const paid = document.paidPence;
    const isClosed = ['RETURNED', 'VOID'].includes(invoice.paymentStatus);
    const effectivePaid = document.paidPence;
    const balance = document.balancePence;
    return { ...invoice, paid, effectivePaid, balance, isClosed };
  });

  const outstanding = balances.account.outstandingPence;
  const totalBilled = balances.selection.totalBilledPence;
  const totalPaid = balances.selection.totalPaidPence;
  const activePurchaseInvoiceCount = balances.account.unpaidInvoiceCount;
  const lastPaymentAt = balances.account.lastPaymentAt;

  // Credit / status
  const creditLimit = supplier.creditLimitPence;
  const availableCredit = creditLimit > 0 ? creditLimit - outstanding : null;
  const supplierStatus: 'up-to-date' | 'amount-owed' | 'over-limit' | 'credit-balance' =
    outstanding < 0 ? 'credit-balance' : outstanding === 0 ? 'up-to-date'
    : creditLimit > 0 && outstanding > creditLimit ? 'over-limit'
    : 'amount-owed';

  const ledgerRows = invoices
    .flatMap((invoice) => {
      return [{
        key: `${invoice.id}-invoice`,
        date: invoice.createdAt,
        sortKey: invoice.createdAt.getTime(),
        type: 'purchase' as const,
        description: 'Purchase',
        debitPence: invoice.isClosed ? 0 : invoice.totalPence,
        creditPence: 0,
        balanceEffectPence: invoice.isClosed ? 0 : invoice.totalPence,
      },
      ...invoice.returnCredits.map((credit) => ({
        key: credit.id,
        date: credit.createdAt,
        sortKey: credit.createdAt.getTime(),
        type: 'adjustment' as const,
        description: `Supplier return credit — ${credit.reason}`,
        debitPence: 0,
        creditPence: credit.creditPence,
        balanceEffectPence: -credit.creditPence,
      })),
      ...invoice.payments.map((payment) => ({
        key: payment.id,
        date: payment.paidAt,
        sortKey: payment.paidAt.getTime() + 0.1,
        type: 'payment' as const,
        description: `Payment${payment.notes ? ` - ${payment.notes}` : ''} (${PAYMENT_LABEL[payment.method] ?? payment.method})`,
        debitPence: 0,
        creditPence: payment.amountPence,
        balanceEffectPence: invoice.isClosed ? 0 : -payment.amountPence,
      })),
      ];
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .reduce<Array<{
      key: string;
      date: Date;
      type: 'purchase' | 'payment' | 'adjustment';
      description: string;
      debitPence: number;
      creditPence: number;
      balancePence: number;
    }>>((rows, row) => {
      const previousBalance = rows.at(-1)?.balancePence ?? 0;
      const { sortKey: _sortKey, balanceEffectPence, ...rest } = row;
      rows.push({ ...rest, balancePence: previousBalance + balanceEffectPence });
      return rows;
    }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        subtitle="Supplier account, purchases, and payment history."
        secondaryCta={{ label: '← Back to suppliers', href: '/suppliers' }}
      />

      {/* Account hero */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Supplier account</span>
              <SupplierStatusBadge status={supplierStatus} />
              {supplierTags.length > 0 ? <TagChips tags={supplierTags} /> : null}
            </div>
            <h2 className="text-2xl font-display font-semibold text-ink">{supplier.name}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-black/60">
              <span>Phone: {supplier.phone ?? 'No phone saved'}</span>
              <span>Email: {supplier.email ?? 'No email saved'}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-5 py-4 lg:min-w-72">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">{outstanding < 0 ? 'Supplier credit balance' : 'What you owe'}</div>
            <div className={`mt-2 text-3xl font-bold tabular-nums ${outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {formatMoney(outstanding, business.currency)}
            </div>
            <div className="mt-1 text-xs text-black/55">
              {outstanding > 0 ? `${activePurchaseInvoiceCount} unpaid purchase invoice${activePurchaseInvoiceCount === 1 ? '' : 's'} need attention.` : outstanding < 0 ? 'Supplier credit balance — review excess payments.' : 'This supplier account is up to date.'}
              <p className="mt-1">All purchase dates · all recorded payments. History filters do not change this balance.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Primary actions */}
      <div className="flex flex-wrap gap-2">
        <Link href={`/payments/supplier-payments?supplierId=${supplier.id}`} className={outstanding > 0 ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>
          Record payment
        </Link>
        <Link href={`/purchases?supplierId=${supplier.id}`} className="btn-secondary text-sm">
          Create purchase
        </Link>
        <DownloadLink
          className="btn-secondary text-sm"
          href={`/suppliers/${supplier.id}/statement`}
          fallbackFilename={`supplier-statement-${supplier.id.slice(0, 8)}.csv`}
        >
          View statement (CSV)
        </DownloadLink>
        {features.advancedReports ? (
          <Link href={`/reports/sales-by-supplier?supplierId=${supplier.id}&period=mtd`} className="btn-secondary text-sm">
            View Sales Performance
          </Link>
        ) : null}
        <a href="#products-supplied" className="btn-secondary text-sm">
          {linkedProducts.length > 0 ? 'View linked products' : 'Link products'}
        </a>
        <a href="#account-details" className="btn-ghost text-sm">
          Edit details
        </a>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AccountStatCard
          label={outstanding < 0 ? 'Supplier credit balance' : 'What you owe'}
          value={<span className={outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}>{formatMoney(outstanding, business.currency)}</span>}
          helper={`All purchase dates · ${activePurchaseInvoiceCount} unpaid purchase invoice${activePurchaseInvoiceCount === 1 ? '' : 's'}`}
        />
        <AccountStatCard
          label="Credit limit"
          value={formatMoney(creditLimit, business.currency)}
          helper={
            creditLimit > 0 && availableCredit !== null
              ? availableCredit < 0
                ? <span className="text-red-600">{formatMoney(Math.abs(availableCredit), business.currency)} over</span>
                : `${formatMoney(availableCredit, business.currency)} remaining`
              : 'No limit set'
          }
        />
        <AccountStatCard
          label="Last payment"
          value={lastPaymentAt ? formatRelativeDate(lastPaymentAt) : 'No payment yet'}
          helper={lastPaymentAt ? formatDate(lastPaymentAt) : 'Payments will appear once recorded.'}
        />
        <AccountStatCard
          label="Total purchases"
          value={formatMoney(balances.account.totalBilledPence, business.currency)}
          helper={`All purchase dates · ${balances.account.invoiceCount} invoices`}
        />
        <AccountStatCard
          label="Linked products"
          value={linkedProducts.length.toLocaleString()}
          helper="Products using this preferred supplier"
        />
      </div>

      {/* Account details */}
      <details className="group" id="account-details">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-ink">Account details</span>
          <svg className="h-4 w-4 text-muted transition-transform duration-150 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </summary>
        <div className="card mt-2 p-5 sm:p-6">
          <form action={updateSupplierAction} className="grid gap-4 md:grid-cols-3">
            <input type="hidden" name="id" value={supplier.id} />
            <div>
              <label className="label">Name</label>
              <input className="input" name="name" defaultValue={supplier.name} required />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" name="phone" defaultValue={supplier.phone ?? ''} placeholder="Phone" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" name="email" defaultValue={supplier.email ?? ''} placeholder="Email" />
            </div>
            <div>
              <label className="label">Credit limit</label>
              <input
                className="input"
                name="creditLimit"
                defaultValue={(supplier.creditLimitPence / 100).toFixed(2)}
                placeholder="Credit limit"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Tags</label>
              <input
                className="input"
                name="tags"
                defaultValue={supplierTags.join(', ')}
                placeholder="Wholesale, Local, Net 30"
              />
              <div className="mt-1 text-xs text-black/50">
                Comma-separated. Use tags to group suppliers (e.g. Wholesale, Local, Imported).
              </div>
            </div>
            <div className="md:col-span-3">
              <label className="label">Notes</label>
              <textarea
                className="input min-h-20"
                name="notes"
                defaultValue={supplierNotes}
                placeholder="Delivery quirks, account contact, payment preferences."
              />
            </div>
            <div className="md:col-span-3">
              <SubmitButton className="btn-primary" loadingText="Saving…">Save changes</SubmitButton>
            </div>
          </form>
        </div>
      </details>

      {/* Purchase history */}
      <AccountSection id="purchase-history" title="Purchases and payment history" description={`${balances.selection.invoiceCount} matching purchases · 25 per page`} defaultOpen={Boolean(searchParams?.from || searchParams?.to || searchParams?.historyPage)}>
        <p className="mt-1 text-sm text-black/50">Purchases increase what you owe; payments reduce the supplier balance. Filter by purchase date. Amounts include all payments recorded against those purchases, including payments outside the selected dates. This is not a historical balance as of the end date.</p>
        <form className="mt-4 grid gap-4 md:grid-cols-4">
          <input type="hidden" name="historyPage" value="1" />
          <div>
            <label className="label">From</label>
            <input className="input" name="from" type="date" defaultValue={searchParams?.from ?? ''} />
          </div>
          <div>
            <label className="label">To</label>
            <input className="input" name="to" type="date" defaultValue={searchParams?.to ?? ''} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full">Filter</button>
          </div>
          <div className="flex items-end">
            <DownloadLink
              className="btn-ghost w-full text-xs"
              href={`/suppliers/${supplier.id}/statement?from=${searchParams?.from ?? ''}&to=${
                searchParams?.to ?? ''
              }`}
              fallbackFilename={`supplier-statement-${supplier.id.slice(0, 8)}.csv`}
            >
              Download CSV
            </DownloadLink>
          </div>
        </form>
        <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            Purchases in selection: {formatMoney(totalBilled, business.currency)}
          </div>
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            Paid against selected purchases: {formatMoney(totalPaid, business.currency)}
          </div>
          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
            Balance on selected purchases: {formatMoney(balances.selection.outstandingPence, business.currency)}
          </div>
        </div>

        <p className="mt-3 text-sm text-slate-600">Showing {invoices.length ? historyOffset + 1 : 0}–{historyOffset + invoices.length} of {balances.selection.invoiceCount} matching purchases, newest first. Totals include every matching purchase. Download CSV for the full selection.</p>
        <div className="mt-4 space-y-3 lg:hidden">
          {invoices.length === 0 ? (
            <div className="rounded-xl border border-black/10 bg-white px-4 py-6 text-center text-sm text-black/50">
              <div className="font-semibold text-ink">No purchases yet.</div>
              <div className="mt-1">When you record purchases from this supplier, unpaid items will appear here.</div>
            </div>
          ) : (
            invoices.map((invoice) => {
              const now = new Date();
              return (
                <div key={invoice.id} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/purchases/${invoice.id}`} className="font-mono text-xs hover:underline">
                        {displayDocumentNumber('purchase', invoice.transactionNumber, invoice.id)}
                      </Link>
                      <div className="mt-1 text-xs text-black/50">{formatDateTime(invoice.createdAt)}</div>
                    </div>
                    <span className="pill shrink-0 bg-black/5 text-black/60">{STATUS_LABEL[invoice.paymentStatus] ?? invoice.paymentStatus}</span>
                  </div>

                  <div className="mt-3">
                    <RemainingBalance
                      amountPence={invoice.totalPence - invoice.returnCreditPence}
                      paidPence={invoice.paid}
                      currency={business.currency}
                    />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <DueDateBadge dueDate={invoice.dueDate} now={now} isClosed={invoice.isClosed} />
                    {!invoice.isClosed && (
                      <SetPurchaseDueDateButton invoiceId={invoice.id} currentDueDate={invoice.dueDate} />
                    )}
                  </div>

                  {invoice.payments.length > 0 && (
                    <div className="mt-3 rounded-xl border border-black/5 bg-black/[0.02] px-3 py-2">
                      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-black/40">Payment history</div>
                      <div className="space-y-1">
                        {invoice.payments.map((payment) => (
                          <div key={payment.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-black/70">
                            <span className="font-semibold">{formatMoney(payment.amountPence, business.currency)}</span>
                            <span>{PAYMENT_LABEL[payment.method] ?? payment.method}</span>
                            <span className="text-black/40">{formatDate(payment.paidAt)}</span>
                            {payment.notes && <span className="text-black/40">{payment.notes}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!invoice.isClosed && invoice.balance > 0 && (
                    <Link href={`/payments/supplier-payments?supplierId=${supplier.id}`} className="btn-ghost mt-3 w-full justify-center text-xs">
                      Record payment
                    </Link>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="responsive-table-shell hidden lg:block">
          <table className="table mt-4 w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Purchased</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const now = new Date();
                return (
                  <Fragment key={invoice.id}>
                    <tr className="rounded-xl bg-white transition-all duration-150 hover:-translate-y-px hover:bg-slate-50 hover:shadow-card motion-reduce:transform-none motion-reduce:transition-none">
                      <td className="px-3 py-3 text-sm">
                        <Link href={`/purchases/${invoice.id}`} className="font-mono text-xs hover:underline">
                          {displayDocumentNumber('purchase', invoice.transactionNumber, invoice.id)}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-sm text-black/60">{formatDateTime(invoice.createdAt)}</td>
                      <td className="px-3 py-3 text-sm">
                        <div className="flex items-center gap-1">
                          <DueDateBadge dueDate={invoice.dueDate} now={now} isClosed={invoice.isClosed} />
                          {!invoice.isClosed && (
                            <SetPurchaseDueDateButton invoiceId={invoice.id} currentDueDate={invoice.dueDate} />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="pill bg-black/5 text-black/60">{STATUS_LABEL[invoice.paymentStatus] ?? invoice.paymentStatus}</span>
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold">
                        <RemainingBalance
                          amountPence={invoice.totalPence - invoice.returnCreditPence}
                          paidPence={invoice.paid}
                          currency={business.currency}
                        />
                      </td>
                      <td className="px-3 py-3 text-sm">
                        {!invoice.isClosed && invoice.balance > 0 && (
                          <Link href={`/payments/supplier-payments?supplierId=${supplier.id}`} className="btn-ghost text-xs">
                            Record payment
                          </Link>
                        )}
                      </td>
                    </tr>
                    {invoice.payments.length > 0 && (
                      <tr className="bg-transparent">
                        <td colSpan={6} className="px-3 pb-3 pt-0">
                          <div className="rounded-xl border border-black/5 bg-black/[0.02] px-3 py-2">
                            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-black/40">Payment history</div>
                            <div className="space-y-1">
                              {invoice.payments.map((payment) => (
                                <div key={payment.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-black/70">
                                  <span className="font-semibold">{formatMoney(payment.amountPence, business.currency)}</span>
                                  <span>{PAYMENT_LABEL[payment.method] ?? payment.method}</span>
                                  <span className="text-black/40">{formatDate(payment.paidAt)}</span>
                                  {payment.notes && <span className="text-black/40">{payment.notes}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-black/50">
                    <div className="font-semibold text-ink">No purchases yet.</div>
                    <div className="mt-1">When you record purchases from this supplier, unpaid items will appear here.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <nav aria-label="Supplier purchase history pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          {historyPage > 1 ? <Link className="btn-secondary" href={`?${new URLSearchParams({ from: searchParams?.from ?? '', to: searchParams?.to ?? '', historyPage: String(historyPage - 1) })}#purchase-history`}>Previous purchases</Link> : <span />}
          <span>Page {historyPage} of {Math.max(1, Math.ceil(balances.selection.invoiceCount / historyPageSize))}</span>
          {historyOffset + invoices.length < balances.selection.invoiceCount ? <Link className="btn-secondary" href={`?${new URLSearchParams({ from: searchParams?.from ?? '', to: searchParams?.to ?? '', historyPage: String(historyPage + 1) })}#purchase-history`}>Next purchases</Link> : null}
        </nav>
      </AccountSection>

      {/* Statement */}
      <AccountSection id="supplier-statement" title="Statement" description="Running subtotal for the displayed purchase history">
        <p className="mt-1 text-sm text-black/50">This running subtotal covers only the purchases loaded in the history above and their recorded payments. It starts at zero for that set; it is not the full supplier account balance. Returned and voided purchases contribute zero to the subtotal; their original payments remain listed.</p>
        <p className="mt-1 text-sm text-black/50">Showing the latest {Math.min(ledgerRows.length, 80)} of {ledgerRows.length} history entries. Use the account balance above for the complete amount owed.</p>
        <div className="responsive-table-shell mt-4">
          <table className="table w-full min-w-[48rem] border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Purchase</th>
                <th>Payment</th>
                <th>History subtotal</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.slice(-80).map((row) => (
                <tr key={row.key} className="rounded-xl bg-white transition-all duration-150 hover:-translate-y-px hover:bg-slate-50 hover:shadow-card motion-reduce:transform-none motion-reduce:transition-none">
                  <td className="px-3 py-3 text-sm text-black/60">{formatDate(row.date)}</td>
                  <td className="px-3 py-3 text-sm">
                    <span className={row.type === 'payment' ? 'text-emerald-700' : row.type === 'purchase' ? 'text-ink' : 'text-black/50'}>
                      {row.description}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold">{row.debitPence > 0 ? formatMoney(row.debitPence, business.currency) : '-'}</td>
                  <td className="px-3 py-3 text-sm font-semibold text-emerald-700">{row.creditPence > 0 ? formatMoney(row.creditPence, business.currency) : '-'}</td>
                  <td className="px-3 py-3 text-sm font-semibold">{formatMoney(row.balancePence, business.currency)}</td>
                </tr>
              ))}
              {ledgerRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-black/50">
                    <div className="font-semibold text-ink">No payments recorded yet.</div>
                    <div className="mt-1">Payments will appear here once recorded.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AccountSection>

      {/* Sales Performance (Growth+ only) */}
      {supplierSales && supplierSales.rows.length > 0 ? (() => {
        const row = supplierSales.rows[0];
        const topProduct = row?.products[0] ?? null;
        return (
          <AccountSection id="supplier-sales" title="Sales Performance" description="Month-to-date sales of linked products">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-display font-semibold">Sales Performance</h2>
                <p className="mt-1 text-sm text-black/50">Month-to-date revenue from products linked to this supplier.</p>
              </div>
              <Link
                href={`/reports/sales-by-supplier?supplierId=${supplier.id}&period=mtd`}
                className="btn-ghost text-xs whitespace-nowrap"
              >
                Full report →
              </Link>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wide text-black/40">Revenue (MTD)</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {formatMoney(row?.totalRevenuePence ?? 0, business.currency)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wide text-black/40">Units sold</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {(row?.totalQtyBase ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wide text-black/40">Sales count</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {(row?.totalSalesCount ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wide text-black/40">Top product</div>
                <div className="text-sm font-semibold text-ink">
                  {topProduct ? (
                    <Link href={`/products/${topProduct.productId}`} className="hover:underline">
                      {topProduct.productName}
                    </Link>
                  ) : '—'}
                </div>
                {topProduct ? (
                  <div className="text-xs text-black/50">{formatMoney(topProduct.revenuePence, business.currency)} revenue</div>
                ) : null}
              </div>
            </div>
          </AccountSection>
        );
      })() : null}

      {/* Products supplied */}
      <AccountSection id="products-supplied" title="Products supplied" description={`${linkedProducts.length} displayed preferred-supplier products`}>
        <p className="mt-1 text-sm text-black/50">Products where {supplier.name} is the preferred supplier.</p>
        {linkedProducts.length > 0 ? (
          <div className="responsive-table-shell mt-4">
            <table className="table w-full border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Current stock</th>
                  <th>Default cost</th>
                  <th>Selling price</th>
                </tr>
              </thead>
              <tbody>
                {linkedProducts.map((product) => {
                  const currentStock = product.inventoryBalances.reduce((sum, balance) => sum + balance.qtyOnHandBase, 0);
                  return (
                    <tr key={product.id} className="rounded-xl bg-white transition-all duration-150 hover:-translate-y-px hover:bg-slate-50 hover:shadow-card motion-reduce:transform-none motion-reduce:transition-none">
                      <td className="px-3 py-3 text-sm font-semibold">
                        <Link href={`/products/${product.id}`} className="hover:underline">
                          {product.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-sm text-black/60">{product.sku ?? '-'}</td>
                      <td className="px-3 py-3 text-sm tabular-nums">{currentStock.toLocaleString()}</td>
                      <td className="px-3 py-3 text-sm font-semibold tabular-nums">
                        {formatMoney(product.defaultCostBasePence, business.currency)}
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold tabular-nums">
                        {formatMoney(product.sellingPriceBasePence, business.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-black/15 bg-white px-5 py-6">
            <div className="text-sm font-semibold text-ink">No products linked yet</div>
            <p className="mt-1 max-w-2xl text-sm text-black/55">
              Set {supplier.name} as the preferred supplier on products, or record a purchase from {supplier.name} containing those products.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/products" className="btn-primary text-sm">Manage products</Link>
              <Link href={`/reports/sales-by-supplier?supplierId=${supplier.id}&period=mtd`} className="btn-secondary text-sm">
                View report
              </Link>
            </div>
          </div>
        )}
      </AccountSection>
    </div>
  );
}
