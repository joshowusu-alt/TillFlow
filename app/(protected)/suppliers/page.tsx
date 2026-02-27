import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import SearchFilter from '@/components/SearchFilter';
import Pagination from '@/components/Pagination';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { createSupplierAction } from '@/app/actions/suppliers';
import { formatMoney, DEFAULT_PAGE_SIZE } from '@/lib/format';
import { computeOutstandingBalance } from '@/lib/accounting';
import Link from 'next/link';
import { Suspense } from 'react';

export default async function SuppliersPage({ searchParams }: { searchParams?: { error?: string; q?: string; page?: string } }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const q = searchParams?.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);

  const where = {
    businessId: business.id,
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
  };

  const [totalCount, suppliers] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        creditLimitPence: true,
        purchaseInvoices: {
          select: {
            paymentStatus: true,
            totalPence: true,
            payments: { select: { amountPence: true } }
          }
        }
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader title="Suppliers" subtitle="Vendors and payables." />
      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Add supplier</h2>
        <FormError error={searchParams?.error} />
        <form action={createSupplierAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <input className="input" name="name" placeholder="Supplier name" required />
          <input className="input" name="phone" placeholder="Phone" />
          <input className="input" name="email" placeholder="Email" />
          <input className="input" name="creditLimit" placeholder="Credit limit (e.g., 500.00)" />
          <div className="md:col-span-3">
            <SubmitButton className="btn-primary" loadingText="Adding…">Add supplier</SubmitButton>
          </div>
        </form>
      </div>

      <div className="mb-4 max-w-xs">
        <Suspense><SearchFilter placeholder="Search suppliers…" /></Suspense>
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
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="rounded-full bg-black/5 p-3 mb-2">
                      <svg className="h-6 w-6 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div className="text-sm text-black/70">{q ? `No suppliers matching "${q}"` : 'No suppliers yet'}</div>
                    <div className="text-xs text-black/40 mt-1">Add your first supplier using the form above.</div>
                  </div>
                </td>
              </tr>
            )}
            {suppliers.map((supplier) => {
              const balance = supplier.purchaseInvoices.reduce(
                (sum, invoice) => sum + computeOutstandingBalance(invoice),
                0
              );
              return (
                <tr key={supplier.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 font-semibold">
                    <Link href={`/suppliers/${supplier.id}`} className="hover:underline">
                      {supplier.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-sm text-black/60">{supplier.phone ?? '-'}</td>
                  <td className="px-3 py-3 text-sm text-black/60">{supplier.email ?? '-'}</td>
                  <td className="px-3 py-3 text-sm">{formatMoney(supplier.creditLimitPence, business.currency)}</td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {formatMoney(balance, business.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/suppliers" searchParams={{ q: q || undefined }} />
      </div>
    </div>
  );
}
