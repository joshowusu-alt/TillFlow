import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import SearchFilter from '@/components/SearchFilter';
import Pagination from '@/components/Pagination';
import { DataCard, DataCardActions, DataCardField, DataCardHeader } from '@/components/DataCard';
import TagChips from '@/components/TagChips';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { createSupplierAction } from '@/app/actions/suppliers';
import { formatMoney, formatRelativeDate, DEFAULT_PAGE_SIZE } from '@/lib/format';
import { computeOutstandingBalance } from '@/lib/accounting';
import { parseTags } from '@/lib/contact-tags';
import Link from 'next/link';
import { Suspense } from 'react';

function SupplierStatusBadge({ balance, creditLimit }: { balance: number; creditLimit: number }) {
  if (balance === 0) {
    return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Up to date</span>;
  }
  if (creditLimit > 0 && balance > creditLimit) {
    return <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Over limit</span>;
  }
  return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Amount owed</span>;
}

export default async function SuppliersPage({ searchParams }: { searchParams?: { error?: string; q?: string; page?: string; amountOwed?: string } }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const q = searchParams?.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const amountOwed = searchParams?.amountOwed === '1';

  const where = {
    businessId: business.id,
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    ...(amountOwed
      ? { purchaseInvoices: { some: { paymentStatus: { in: ['UNPAID', 'PART_PAID'] as string[] } } } }
      : {}),
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
        tagsJson: true,
        purchaseInvoices: {
          where: { paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
          select: {
            paymentStatus: true,
            totalPence: true,
            createdAt: true,
            payments: {
              select: { amountPence: true, paidAt: true },
              orderBy: { paidAt: 'desc' },
            }
          },
          orderBy: { createdAt: 'desc' },
        }
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE));

  // Batch-load linked product counts
  const supplierIds = suppliers.map((s) => s.id);
  const productCounts = supplierIds.length
    ? await prisma.product.groupBy({
        by: ['preferredSupplierId'],
        where: {
          businessId: business.id,
          preferredSupplierId: { in: supplierIds },
        },
        _count: { _all: true },
      })
    : ([] as Array<{ preferredSupplierId: string | null; _count: { _all: number } }>);

  const productCountMap = new Map<string, number>();
  for (const row of productCounts) {
    if (row.preferredSupplierId) {
      productCountMap.set(row.preferredSupplierId, row._count._all);
    }
  }

  // Compute derived data for each supplier
  const suppliersWithData = suppliers.map((supplier) => {
    const balance = supplier.purchaseInvoices.reduce(
      (sum, invoice) => sum + computeOutstandingBalance(invoice),
      0
    );
    const lastPurchaseAt = supplier.purchaseInvoices[0]?.createdAt ?? null;

    let lastPaymentAt: Date | null = null;
    for (const inv of supplier.purchaseInvoices) {
      for (const payment of inv.payments) {
        if (!lastPaymentAt || payment.paidAt > lastPaymentAt) {
          lastPaymentAt = payment.paidAt;
        }
      }
    }

    return {
      ...supplier,
      balance,
      lastPurchaseAt,
      lastPaymentAt,
      linkedProductCount: productCountMap.get(supplier.id) ?? 0,
      tags: parseTags(supplier.tagsJson),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Suppliers" subtitle="Vendors and payables." />

      {/* Add supplier */}
      <div className="card p-5 sm:p-6">
        <h2 className="text-lg font-display font-semibold">Add supplier</h2>
        <FormError error={searchParams?.error} />
        <form action={createSupplierAction} className="mt-4 grid gap-4 md:grid-cols-3">
          <input className="input" name="name" placeholder="Supplier name" required />
          <input className="input" name="phone" placeholder="Phone" />
          <input className="input" name="email" placeholder="Email" />
          <input className="input" name="creditLimit" placeholder="Credit limit (e.g., 500.00)" />
          <div className="md:col-span-2">
            <input className="input" name="tags" placeholder="Tags — e.g. Wholesale, Local, Net 30" />
          </div>
          <div className="md:col-span-3">
            <textarea className="input min-h-16" name="notes" placeholder="Notes — delivery quirks, account contact, payment preferences." />
          </div>
          <div className="md:col-span-3">
            <SubmitButton className="btn-primary" loadingText="Adding…">Add supplier</SubmitButton>
          </div>
        </form>
      </div>

      {/* Search and filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-xs flex-1">
          <Suspense><SearchFilter placeholder="Search suppliers…" /></Suspense>
        </div>
        <div className="flex items-center gap-2">
          {amountOwed ? (
            <Link
              href={`/suppliers?${q ? `q=${encodeURIComponent(q)}&` : ''}`}
              className="btn-secondary text-sm"
            >
              Show all suppliers
            </Link>
          ) : (
            <Link
              href={`/suppliers?${q ? `q=${encodeURIComponent(q)}&` : ''}amountOwed=1`}
              className="btn-secondary text-sm"
            >
              Amount owed only
            </Link>
          )}
          {amountOwed && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
              Showing suppliers with amount owed
            </span>
          )}
        </div>
      </div>

      <div className="card p-4 sm:p-6">
        {/* Mobile cards */}
        <div className="space-y-3 lg:hidden">
          {suppliersWithData.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white px-4 py-10 text-center">
              <div className="mx-auto mb-2 inline-flex rounded-full bg-black/5 p-3">
                <svg className="h-6 w-6 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="text-sm text-black/70">{q ? `No suppliers matching "${q}"` : amountOwed ? 'No suppliers with amount owed' : 'No suppliers yet'}</div>
              <div className="mt-1 text-xs text-black/40">
                {amountOwed ? 'No outstanding payables.' : 'Add your first supplier using the form above.'}
              </div>
            </div>
          ) : (
            suppliersWithData.map((supplier) => (
              <DataCard key={supplier.id}>
                <DataCardHeader
                  title={<Link href={`/suppliers/${supplier.id}`} className="hover:underline">{supplier.name}</Link>}
                  subtitle={supplier.phone ?? 'No phone saved'}
                  aside={<SupplierStatusBadge balance={supplier.balance} creditLimit={supplier.creditLimitPence} />}
                />
                {supplier.tags.length > 0 ? <TagChips tags={supplier.tags} max={4} className="mt-2" /> : null}
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <DataCardField label="Amount owed" value={<span className="font-semibold text-ink">{formatMoney(supplier.balance, business.currency)}</span>} />
                  <DataCardField label="Credit limit" value={<span className="font-semibold text-ink">{formatMoney(supplier.creditLimitPence, business.currency)}</span>} />
                  <DataCardField label="Last payment" value={<span className="text-black/65">{supplier.lastPaymentAt ? formatRelativeDate(supplier.lastPaymentAt) : 'No payment yet'}</span>} />
                  <DataCardField label="Last purchase" value={<span className="text-black/65">{supplier.lastPurchaseAt ? formatRelativeDate(supplier.lastPurchaseAt) : 'No purchases'}</span>} />
                  {supplier.linkedProductCount > 0 ? (
                    <DataCardField label="Linked products" value={<span className="text-black/65">{supplier.linkedProductCount} product{supplier.linkedProductCount === 1 ? '' : 's'}</span>} />
                  ) : null}
                </div>
                <DataCardActions>
                  <Link href={`/suppliers/${supplier.id}`} className="btn-ghost text-xs">View supplier</Link>
                  {supplier.balance > 0 ? (
                    <Link href={`/payments/supplier-payments?supplierId=${supplier.id}`} className="btn-primary text-xs">Record payment</Link>
                  ) : null}
                </DataCardActions>
              </DataCard>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="table w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th className="hidden xl:table-cell">Last purchase</th>
                <th className="hidden xl:table-cell">Last payment</th>
                <th className="hidden lg:table-cell">Linked products</th>
                <th>Amount owed</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppliersWithData.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="rounded-full bg-black/5 p-3 mb-2">
                        <svg className="h-6 w-6 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div className="text-sm text-black/70">{q ? `No suppliers matching "${q}"` : amountOwed ? 'No suppliers with amount owed' : 'No suppliers yet'}</div>
                      <div className="text-xs text-black/40 mt-1">
                        {amountOwed ? 'No outstanding payables.' : 'Add your first supplier using the form above.'}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {suppliersWithData.map((supplier) => (
                <tr key={supplier.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 font-semibold">
                    <div className="flex flex-col gap-1">
                      <Link href={`/suppliers/${supplier.id}`} className="hover:underline">
                        {supplier.name}
                      </Link>
                      {supplier.tags.length > 0 ? <TagChips tags={supplier.tags} max={3} /> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm text-black/60">{supplier.phone ?? '-'}</td>
                  <td className="hidden xl:table-cell px-3 py-3 text-sm text-black/60">
                    {supplier.lastPurchaseAt ? formatRelativeDate(supplier.lastPurchaseAt) : 'No purchases'}
                  </td>
                  <td className="hidden xl:table-cell px-3 py-3 text-sm text-black/60">
                    {supplier.lastPaymentAt ? formatRelativeDate(supplier.lastPaymentAt) : 'No payment yet'}
                  </td>
                  <td className="hidden lg:table-cell px-3 py-3 text-sm text-black/60">
                    {supplier.linkedProductCount > 0 ? `${supplier.linkedProductCount} product${supplier.linkedProductCount === 1 ? '' : 's'}` : '-'}
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold tabular-nums">
                    {formatMoney(supplier.balance, business.currency)}
                  </td>
                  <td className="px-3 py-3">
                    <SupplierStatusBadge balance={supplier.balance} creditLimit={supplier.creditLimitPence} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/suppliers/${supplier.id}`} className="btn-ghost text-xs whitespace-nowrap">
                        View supplier
                      </Link>
                      {supplier.balance > 0 ? (
                        <Link href={`/payments/supplier-payments?supplierId=${supplier.id}`} className="btn-primary text-xs whitespace-nowrap">
                          Record payment
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/suppliers"
          searchParams={{ q: q || undefined, amountOwed: amountOwed ? '1' : undefined }}
        />
      </div>
    </div>
  );
}
