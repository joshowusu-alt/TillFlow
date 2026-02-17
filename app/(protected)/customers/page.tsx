import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import SearchFilter from '@/components/SearchFilter';
import Pagination from '@/components/Pagination';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { createCustomerAction } from '@/app/actions/customers';
import { formatMoney } from '@/lib/format';
import Link from 'next/link';
import { Suspense } from 'react';

const PAGE_SIZE = 25;

export default async function CustomersPage({ searchParams }: { searchParams?: { error?: string; q?: string; page?: string } }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const q = searchParams?.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);

  const where = {
    businessId: business.id,
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
  };

  const [totalCount, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        creditLimitPence: true,
        salesInvoices: {
          select: {
            paymentStatus: true,
            totalPence: true,
            payments: { select: { amountPence: true } }
          }
        }
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" subtitle="Credit customers and contact details." />
      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Add customer</h2>
        <FormError error={searchParams?.error} />
        <form action={createCustomerAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <input className="input" name="name" placeholder="Customer name" required />
          <input className="input" name="phone" placeholder="Phone" />
          <input className="input" name="email" placeholder="Email" />
          <input className="input" name="creditLimit" placeholder="Credit limit (e.g., 500.00)" />
          <div className="md:col-span-3">
            <SubmitButton className="btn-primary" loadingText="Adding…">Add customer</SubmitButton>
          </div>
        </form>
      </div>

      <div className="mb-4 max-w-xs">
        <Suspense><SearchFilter placeholder="Search customers…" /></Suspense>
      </div>
      <div className="card p-6 overflow-x-auto">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Credit Limit</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center">
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
              const balance = customer.salesInvoices.reduce((sum, invoice) => {
                if (['RETURNED', 'VOID'].includes(invoice.paymentStatus)) {
                  return sum;
                }
                const paid = invoice.payments.reduce((paidSum, payment) => paidSum + payment.amountPence, 0);
                return sum + Math.max(invoice.totalPence - paid, 0);
              }, 0);
              return (
                <tr key={customer.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 font-semibold">
                    <Link href={`/customers/${customer.id}`} className="hover:underline">
                      {customer.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-sm text-black/60">{customer.phone ?? '-'}</td>
                  <td className="px-3 py-3 text-sm text-black/60">{customer.email ?? '-'}</td>
                  <td className="px-3 py-3 text-sm">{formatMoney(customer.creditLimitPence, business.currency)}</td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {formatMoney(balance, business.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/customers" searchParams={{ q: q || undefined }} />
      </div>
    </div>
  );
}
