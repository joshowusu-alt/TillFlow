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
    <div className="space-y-6">
      <PageHeader title="Customers" subtitle="Credit customers and contact details." />
      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Add customer</h2>
        <FormError error={searchParams?.error} />
        <form action={createCustomerAction} className="mt-4 grid gap-4 md:grid-cols-3">
          {business.customerScope === 'BRANCH' ? (
            <input type="hidden" name="storeId" value={selectedStoreId} />
          ) : null}
          <input className="input" name="name" placeholder="Customer name" required />
          <input className="input" name="phone" placeholder="Phone" />
          <input className="input" name="email" placeholder="Email" />
          <input className="input" name="creditLimit" placeholder="Credit limit (e.g., 500.00)" />
          <div className="md:col-span-3">
            <SubmitButton className="btn-primary" loadingText="Adding...">Add customer</SubmitButton>
          </div>
        </form>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <Suspense><SearchFilter placeholder="Search customers by name..." /></Suspense>
        </div>
        {business.customerScope === 'BRANCH' ? (
          <form method="GET" className="flex items-end gap-3">
            <div>
              <label className="label">Branch / Store</label>
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

      <div className="card p-6 overflow-x-auto">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th className="hidden sm:table-cell">Email</th>
              <th className="hidden md:table-cell">Branch</th>
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
                    <div className="text-xs text-black/40 mt-1">Add your first customer using the form above.</div>
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
                  <td className="hidden md:table-cell px-3 py-3 text-sm text-black/60">{branchName}</td>
                  <td className="px-3 py-3 text-sm">{formatMoney(customer.creditLimitPence, business.currency)}</td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {formatMoney(balance, business.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
