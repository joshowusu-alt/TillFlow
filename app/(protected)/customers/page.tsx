import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import Pagination from '@/components/Pagination';
import SearchFilter from '@/components/SearchFilter';
import { requireBusiness } from '@/lib/auth';
import { Suspense } from 'react';
import { createCustomerAction } from '@/app/actions/customers';
import { formatMoney } from '@/lib/format';
import { getCustomers } from '@/lib/services/customers';
import { getBusinessStores } from '@/lib/services/stores';
import { DataCard, DataCardActions, DataCardField, DataCardHeader } from '@/components/DataCard';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: { error?: string; q?: string; page?: string; storeId?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const q = searchParams?.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const { stores, selectedStoreId: rawStoreId } = await getBusinessStores(business.id, searchParams?.storeId);
  const selectedStoreId = (rawStoreId ?? stores[0]?.id) ?? '';

  const { customers, totalCount, totalPages } = await getCustomers(business.id, {
    search: q || undefined,
    page,
    storeId: business.customerScope === 'BRANCH' ? selectedStoreId : undefined,
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Customers"
        subtitle="Credit accounts, balances, and contact details."
        primaryCta={{ label: 'Add customer', href: '#add-customer' }}
      />

      {/* Search & branch filter */}
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
            <button className="btn-secondary" type="submit">
              Apply
            </button>
          </form>
        ) : null}
      </div>

      <details className="details-mobile" id="add-customer" open>
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add customer
          </span>
          <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
            <div className="flex items-end md:col-start-3 md:justify-end">
              <SubmitButton className="btn-primary w-full md:w-auto">Add customer</SubmitButton>
            </div>
          </form>
        </div>
      </details>

      <div className="card p-4 sm:p-5">
        <div className="space-y-3 lg:hidden">
          {customers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 px-4 py-6 text-center">
              <div className="flex flex-col items-center">
                <div className="mb-2 rounded-full bg-black/5 p-3">
                  <svg className="h-6 w-6 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="text-sm text-black/70">{q ? `No customers matching "${q}"` : 'No customers yet'}</div>
                <div className="mt-1 text-xs text-black/40">Use the &lsquo;Add customer&rsquo; section above.</div>
              </div>
            </div>
          ) : customers.map((customer) => {
            const balance = customer.outstandingBalancePence;
            const branchName = customer.storeId
              ? stores.find((store) => store.id === customer.storeId)?.name ?? 'Unknown'
              : 'Shared';

            return (
              <DataCard key={customer.id}>
                <DataCardHeader
                  title={<Link href={`/customers/${customer.id}`} className="hover:underline">{customer.name}</Link>}
                  subtitle={customer.phone ?? 'No phone number'}
                  aside={balance > 0 ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Balance due</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Up to date</span>}
                />
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <DataCardField label="Credit limit" value={<span className="font-semibold text-ink">{formatMoney(customer.creditLimitPence, business.currency)}</span>} />
                  <DataCardField label="Balance" value={<span className="font-semibold text-ink">{formatMoney(balance, business.currency)}</span>} />
                  <DataCardField label="Email" value={<span className="text-black/65">{customer.email ?? '-'}</span>} className="col-span-2" />
                  {business.customerScope === 'BRANCH' ? (
                    <DataCardField label="Branch" value={<span className="text-black/65">{branchName}</span>} className="col-span-2" />
                  ) : null}
                </div>
                <DataCardActions>
                  <Link href={`/customers/${customer.id}`} className="btn-ghost text-xs">
                    View customer
                  </Link>
                </DataCardActions>
              </DataCard>
            );
          })}
        </div>

        <div className="responsive-table-shell hidden lg:block">
          <table className="table w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th className="hidden sm:table-cell">Email</th>
                <th className="hidden lg:table-cell">Branch</th>
                <th>Credit Limit</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="rounded-full bg-black/5 p-3 mb-2">
                        <svg className="h-6 w-6 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="text-sm text-black/70">{q ? `No customers matching "${q}"` : 'No customers yet'}</div>
                      <div className="text-xs text-black/40 mt-1">Use the &lsquo;Add customer&rsquo; section above.</div>
                    </div>
                  </td>
                </tr>
              )}
              {customers.map((customer) => {
                const balance = customer.outstandingBalancePence;
                const branchName = customer.storeId
                  ? stores.find((store) => store.id === customer.storeId)?.name ?? 'Unknown'
                  : 'Shared';

                return (
                  <tr key={customer.id} className="rounded-xl bg-white">
                    <td className="px-3 py-3 font-semibold">
                      <Link href={`/customers/${customer.id}`} className="hover:underline">
                        {customer.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-sm text-black/60">{customer.phone ?? '-'}</td>
                    <td className="hidden sm:table-cell px-3 py-3 text-sm text-black/60">{customer.email ?? '-'}</td>
                    <td className="hidden lg:table-cell px-3 py-3 text-sm text-black/60">{branchName}</td>
                    <td className="px-3 py-3 text-sm">{formatMoney(customer.creditLimitPence, business.currency)}</td>
                    <td className="px-3 py-3 text-sm font-semibold">
                      {formatMoney(balance, business.currency)}
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
          }}
        />
      </div>
    </div>
  );
}
