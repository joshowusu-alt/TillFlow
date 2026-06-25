import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import Pagination from '@/components/Pagination';
import SearchFilter from '@/components/SearchFilter';
import { requireBusiness } from '@/lib/auth';
import { Suspense } from 'react';
import { createCustomerAction } from '@/app/actions/customers';
import { formatMoney, formatRelativeDate } from '@/lib/format';
import { getCustomers } from '@/lib/services/customers';
import { getBusinessStores } from '@/lib/services/stores';
import { DataCard, DataCardActions, DataCardField, DataCardHeader } from '@/components/DataCard';
import TagChips from '@/components/TagChips';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

function CreditStatusBadge({ balance, creditLimit }: { balance: number; creditLimit: number }) {
  if (balance === 0) {
    return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Up to date</span>;
  }
  if (creditLimit > 0 && balance > creditLimit) {
    return <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Over limit</span>;
  }
  return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Balance due</span>;
}

function CustomerStatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-card">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-ink">{value}</div>
      <div className="mt-1 text-xs text-black/50">{helper}</div>
    </div>
  );
}

function CustomersEmptyState({ q, balanceDue }: { q: string; balanceDue: boolean }) {
  const isFiltered = Boolean(q) || balanceDue;
  const title = q
    ? `No customers matching "${q}".`
    : balanceDue
      ? 'No customers with a balance due.'
      : 'No customers yet.';
  const description = q
    ? 'Try a different search, or add the customer if this is a new account.'
    : balanceDue
      ? 'All customer accounts are up to date. New credit balances will appear here when customers owe you money.'
      : 'Add your first customer account so you can track balances, credit limits, and payments in one place.';

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-7 text-center">
      <div className="flex flex-col items-center">
        <div className="mb-3 rounded-full bg-white p-3 shadow-sm">
          <svg className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="mt-1 max-w-md text-sm text-black/55">{description}</div>
        <Link href={isFiltered ? '/customers' : '#add-customer'} className="btn-primary mt-4 text-xs">
          {isFiltered ? 'Show all customers' : 'Add first customer'}
        </Link>
      </div>
    </div>
  );
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: { error?: string; q?: string; page?: string; storeId?: string; balanceDue?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const q = searchParams?.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const balanceDue = searchParams?.balanceDue === '1';
  const { stores, selectedStoreId: rawStoreId } = await measureServerOperation(
    'page.customers.stores-load',
    () => getBusinessStores(business.id, searchParams?.storeId),
    {
      businessId: business.id,
      route: '/customers',
      cacheState: 'uncached-page-load',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
  );
  const selectedStoreId = (rawStoreId ?? stores[0]?.id) ?? '';

  const { customers, totalCount, totalPages } = await measureServerOperation(
    'page.customers.load',
    () => getCustomers(business.id, {
      search: q || undefined,
      page,
      storeId: business.customerScope === 'BRANCH' ? selectedStoreId : undefined,
      balanceDue: balanceDue || undefined,
    }),
    {
      businessId: business.id,
      storeId: business.customerScope === 'BRANCH' ? selectedStoreId : 'ALL',
      route: '/customers',
      page,
      cacheState: 'uncached-page-load',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
  );
  const customersWithBalanceCount = customers.filter((customer) => customer.outstandingBalancePence > 0).length;
  const totalArOutstandingPence = customers.reduce((sum, customer) => sum + customer.outstandingBalancePence, 0);
  const creditLimitCount = customers.filter((customer) => customer.creditLimitPence > 0).length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Customers"
        subtitle="Track what your customers owe you, set credit limits, and record payments."
        primaryCta={{ label: 'Add customer', href: '#add-customer' }}
      />

      <p className="text-xs text-black/50">These are current customer balances across recorded sales and receipts, not limited to a date range.</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CustomerStatCard
          label="Total customers"
          value={totalCount.toLocaleString('en-GH')}
          helper={q || balanceDue ? 'Matching current filters' : 'Customer accounts'}
        />
        <CustomerStatCard
          label="Customers with balance"
          value={customersWithBalanceCount.toLocaleString('en-GH')}
          helper="Customers with an unpaid balance"
        />
        <CustomerStatCard
          label="What customers owe"
          value={formatMoney(totalArOutstandingPence, business.currency)}
          helper="Current balance across all customer accounts"
        />
        <CustomerStatCard
          label="Credit limits set"
          value={creditLimitCount.toLocaleString('en-GH')}
          helper="Visible accounts with limits"
        />
      </div>

      {/* Search, branch filter, and debtor filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <Suspense><SearchFilter placeholder="Search customers by name..." /></Suspense>
        </div>
        {business.customerScope === 'BRANCH' ? (
          <form method="GET" className="flex items-end gap-3">
            <div>
              <label className="label">Branch</label>
              <select className="input" name="storeId" defaultValue={selectedStoreId}>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-secondary" type="submit">Apply</button>
          </form>
        ) : null}
        <div className="flex items-center gap-2">
          {balanceDue ? (
            <Link
              href={`/customers?${q ? `q=${encodeURIComponent(q)}&` : ''}${business.customerScope === 'BRANCH' ? `storeId=${selectedStoreId}&` : ''}`}
              className="btn-secondary text-sm"
            >
              Show all customers
            </Link>
          ) : (
            <Link
              href={`/customers?${q ? `q=${encodeURIComponent(q)}&` : ''}${business.customerScope === 'BRANCH' ? `storeId=${selectedStoreId}&` : ''}balanceDue=1`}
              className="btn-secondary text-sm"
            >
              Balance due only
            </Link>
          )}
          {balanceDue && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
              Showing customers with balance due
            </span>
          )}
        </div>
      </div>

      <details className="group">
        <summary id="add-customer" className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add customer
          </span>
          <svg className="h-4 w-4 text-muted transition-transform duration-150 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </summary>
        <div className="card mt-2 p-4 sm:p-5">
          <FormError error={searchParams?.error} />
          <form action={createCustomerAction} className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">Name <span className="text-red-500">*</span></label>
              <input className="input" name="name" placeholder="e.g. Akosua Mensah" required />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" name="phone" placeholder="e.g. 0244 123 456" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" name="email" type="email" placeholder="e.g. akosua@email.com" />
            </div>
            <div>
              <label className="label">Credit Limit (GHS)</label>
              <input className="input" name="creditLimit" placeholder="0.00" />
            </div>
            {business.customerScope === 'BRANCH' && stores.length > 0 ? (
              <div>
                <label className="label">Branch</label>
                <select className="input" name="storeId">
                  <option value="">All branches</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="md:col-span-2">
              <label className="label">Tags</label>
              <input className="input" name="tags" placeholder="VIP, Wholesale, Net 30" />
              <div className="mt-1 text-xs text-black/50">Comma-separated. Up to 12 tags, 30 characters each.</div>
            </div>
            <div className="md:col-span-3">
              <label className="label">Notes</label>
              <textarea className="input min-h-16" name="notes" placeholder="Anything you want to remember about this customer." />
            </div>
            <div className="flex items-end md:col-start-3 md:justify-end">
              <SubmitButton className="btn-primary w-full md:w-auto">Add customer</SubmitButton>
            </div>
          </form>
        </div>
      </details>

      <div className="card p-4 sm:p-5">
        {/* Mobile cards */}
        <div className="space-y-3 lg:hidden">
          {customers.length === 0 ? (
            <CustomersEmptyState q={q} balanceDue={balanceDue} />
          ) : customers.map((customer) => {
            const balance = customer.outstandingBalancePence;
            const branchName = customer.storeId
              ? stores.find((store) => store.id === customer.storeId)?.name ?? 'Unknown'
              : 'Shared';

            return (
              <DataCard key={customer.id} className="transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100">
                <DataCardHeader
                  title={<Link href={`/customers/${customer.id}`} className="hover:underline">{customer.name}</Link>}
                  subtitle={customer.phone ?? 'No phone number'}
                  aside={
                    <div className="flex items-center gap-2">
                      {customer.channelBreakdown.onlineOrderCount > 0 ? (
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">Online + in-store</span>
                      ) : null}
                      <CreditStatusBadge balance={balance} creditLimit={customer.creditLimitPence} />
                    </div>
                  }
                />
                {customer.tags.length > 0 ? <TagChips tags={customer.tags} max={4} className="mt-2" /> : null}
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <DataCardField label="Balance due" value={<span className="font-semibold text-ink">{formatMoney(balance, business.currency)}</span>} />
                  <DataCardField label="Last payment" value={<span className="text-black/65">{customer.lastPaymentAt ? formatRelativeDate(customer.lastPaymentAt) : 'No payment yet'}</span>} />
                  <DataCardField label="Credit limit" value={<span className="font-semibold text-ink">{formatMoney(customer.creditLimitPence, business.currency)}</span>} />
                  <DataCardField label="Last visit" value={<span className="text-black/65">{customer.lastSaleAt ? formatRelativeDate(customer.lastSaleAt) : 'Never'}</span>} />
                  {business.customerScope === 'BRANCH' ? (
                    <DataCardField label="Branch" value={<span className="text-black/65">{branchName}</span>} className="col-span-2" />
                  ) : null}
                </div>
                <DataCardActions>
                  <Link href={`/customers/${customer.id}`} className="btn-ghost text-xs">
                    Open account
                  </Link>
                  {balance > 0 ? (
                    <Link href={`/payments/customer-receipts?customerId=${customer.id}`} className="btn-primary text-xs">
                      Record payment
                    </Link>
                  ) : null}
                </DataCardActions>
              </DataCard>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="responsive-table-shell hidden lg:block">
          <table className="table w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th className="hidden xl:table-cell">Lifetime spend</th>
                <th className="hidden lg:table-cell">Last visit</th>
                <th className="hidden lg:table-cell">Last payment</th>
                <th>Balance due</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center">
                    <CustomersEmptyState q={q} balanceDue={balanceDue} />
                  </td>
                </tr>
              )}
              {customers.map((customer) => {
                const balance = customer.outstandingBalancePence;
                const branchName = customer.storeId
                  ? stores.find((store) => store.id === customer.storeId)?.name ?? 'Unknown'
                  : 'Shared';

                return (
                  <tr key={customer.id} className="rounded-xl bg-white transition-all duration-150 hover:-translate-y-px hover:bg-slate-50 hover:shadow-card motion-reduce:transform-none motion-reduce:transition-none">
                    <td className="px-3 py-3 font-semibold">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Link href={`/customers/${customer.id}`} className="hover:underline">
                            {customer.name}
                          </Link>
                          {customer.channelBreakdown.onlineOrderCount > 0 ? (
                            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">Online</span>
                          ) : null}
                        </div>
                        {customer.tags.length > 0 ? <TagChips tags={customer.tags} max={3} /> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-black/60">{customer.phone ?? '-'}</td>
                    <td className="hidden xl:table-cell px-3 py-3 text-sm font-semibold tabular-nums text-ink">
                      {formatMoney(customer.lifetimeSpentPence, business.currency)}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-sm text-black/60">
                      {customer.lastSaleAt ? formatRelativeDate(customer.lastSaleAt) : 'Never'}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-sm text-black/60">
                      {customer.lastPaymentAt ? formatRelativeDate(customer.lastPaymentAt) : 'No payment yet'}
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold tabular-nums">
                      {formatMoney(balance, business.currency)}
                    </td>
                    <td className="px-3 py-3">
                      <CreditStatusBadge balance={balance} creditLimit={customer.creditLimitPence} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/customers/${customer.id}`} className="btn-ghost text-xs whitespace-nowrap">
                          Open account
                        </Link>
                        {balance > 0 ? (
                          <Link href={`/payments/customer-receipts?customerId=${customer.id}`} className="btn-primary text-xs whitespace-nowrap">
                            Record payment
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/customers"
          searchParams={{
            q: q || undefined,
            storeId: business.customerScope === 'BRANCH' ? selectedStoreId : undefined,
            balanceDue: balanceDue ? '1' : undefined,
          }}
        />
      </div>
    </div>
  );
}
