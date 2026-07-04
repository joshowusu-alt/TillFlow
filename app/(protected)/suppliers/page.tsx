import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import SearchFilter from '@/components/SearchFilter';
import Pagination from '@/components/Pagination';
import { DataCard, DataCardActions, DataCardField, DataCardHeader } from '@/components/DataCard';
import TagChips from '@/components/TagChips';
import OperationalMetricCard from '@/components/OperationalMetricCard';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { createSupplierAction } from '@/app/actions/suppliers';
import { formatMoney, formatRelativeDate, DEFAULT_PAGE_SIZE } from '@/lib/format';
import { computeOutstandingBalance } from '@/lib/accounting';
import { parseTags } from '@/lib/contact-tags';
import Link from 'next/link';
import { Suspense } from 'react';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

function SupplierStatusBadge({ balance, creditLimit }: { balance: number; creditLimit: number }) {
  if (balance === 0) {
    return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Up to date</span>;
  }
  if (creditLimit > 0 && balance > creditLimit) {
    return <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Over limit</span>;
  }
  return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Amount owed</span>;
}

function SupplierStatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <OperationalMetricCard label={label} value={value} helper={helper} />;
}

function SuppliersEmptyState({ q, amountOwed }: { q: string; amountOwed: boolean }) {
  const isFiltered = Boolean(q) || amountOwed;
  const title = q
    ? `No suppliers matching "${q}".`
    : amountOwed
      ? 'No suppliers with amount owed.'
      : 'No suppliers yet.';
  const description = q
    ? 'Try a different search, or add the supplier if this is a new account.'
    : amountOwed
      ? 'No outstanding payables right now. Suppliers you owe will appear here when purchases are unpaid.'
      : 'Add your first supplier so you can track purchases, payables, and payments in one place.';

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-7 text-center">
      <div className="flex flex-col items-center">
        <div className="mb-3 rounded-full bg-white p-3 shadow-sm">
          <svg className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="mt-1 max-w-md text-sm text-black/55">{description}</div>
        <Link href={isFiltered ? '/suppliers' : '#add-supplier'} className="btn-primary mt-4 text-xs">
          {isFiltered ? 'Show all suppliers' : 'Add first supplier'}
        </Link>
      </div>
    </div>
  );
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

  const [totalCount, suppliers] = await measureServerOperation(
    'page.suppliers.load',
    () => Promise.all([
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
    ]),
    {
      businessId: business.id,
      route: '/suppliers',
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      cacheState: 'uncached-page-load',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE));

  // Batch-load linked product counts
  const supplierIds = suppliers.map((s) => s.id);
  const productCounts = supplierIds.length
    ? await measureServerOperation(
        'page.suppliers.linked-products-load',
        () => prisma.product.groupBy({
          by: ['preferredSupplierId'],
          where: {
            businessId: business.id,
            preferredSupplierId: { in: supplierIds },
          },
          _count: { _all: true },
        }),
        {
          businessId: business.id,
          route: '/suppliers',
          rowCount: supplierIds.length,
          cacheState: 'uncached-page-load',
        },
        { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
      )
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
  const suppliersWithBalanceCount = suppliersWithData.filter((supplier) => supplier.balance > 0).length;
  const totalApOutstandingPence = suppliersWithData.reduce((sum, supplier) => sum + supplier.balance, 0);

  return (
    <div className="operational-page space-y-4 sm:space-y-5">
      <PageHeader
        title="Suppliers"
        subtitle="Track who you buy from, what you owe, and when supplier payments are due."
        primaryCta={{ label: 'Add supplier', href: '#add-supplier' }}
      />

      <p className="text-xs text-black/50">These are current supplier balances across recorded purchases and payments, not limited to a date range.</p>

      <div className="operational-metric-grid operational-metric-grid--3">
        <SupplierStatCard
          label="Total suppliers"
          value={totalCount.toLocaleString('en-GH')}
          helper={q || amountOwed ? 'Matching current filters' : 'Supplier accounts'}
        />
        <SupplierStatCard
          label="Suppliers with balance"
          value={suppliersWithBalanceCount.toLocaleString('en-GH')}
          helper="Suppliers with unpaid purchase balances"
        />
        <SupplierStatCard
          label="What you owe suppliers"
          value={formatMoney(totalApOutstandingPence, business.currency)}
          helper="Current balance across all supplier accounts"
        />
      </div>

      {/* Search and filter */}
      <div className="operational-filter-row">
        <div className="operational-search-shell">
          <Suspense><SearchFilter placeholder="Search suppliers…" /></Suspense>
        </div>
        <div className="operational-filter-actions">
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
            <span className="max-w-full break-words rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 [overflow-wrap:anywhere]">
              Showing suppliers with amount owed
            </span>
          )}
        </div>
      </div>

      {/* Add supplier */}
      <details className="group">
        <summary id="add-supplier" className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add supplier
          </span>
          <svg className="h-4 w-4 text-muted transition-transform duration-150 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </summary>
        <div className="card mt-2 p-5 sm:p-6">
          <FormError error={searchParams?.error} />
          <form action={createSupplierAction} className="grid gap-4 md:grid-cols-3">
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
      </details>

      <div className="card min-w-0 max-w-full p-4 sm:p-6">
        {/* Mobile cards */}
        <div className="space-y-3 lg:hidden">
          {suppliersWithData.length === 0 ? (
            <SuppliersEmptyState q={q} amountOwed={amountOwed} />
          ) : (
            suppliersWithData.map((supplier) => (
              <DataCard key={supplier.id} className="transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100">
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
                  <Link href={`/suppliers/${supplier.id}`} className="btn-ghost text-xs">Open account</Link>
                  {supplier.balance > 0 ? (
                    <Link href={`/payments/supplier-payments?supplierId=${supplier.id}`} className="btn-primary text-xs">Record payment</Link>
                  ) : null}
                </DataCardActions>
              </DataCard>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="responsive-table-shell hidden lg:block">
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
                    <SuppliersEmptyState q={q} amountOwed={amountOwed} />
                  </td>
                </tr>
              )}
              {suppliersWithData.map((supplier) => (
                <tr key={supplier.id} className="rounded-xl bg-white transition-all duration-150 hover:-translate-y-px hover:bg-slate-50 hover:shadow-card motion-reduce:transform-none motion-reduce:transition-none">
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
                        Open account
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
