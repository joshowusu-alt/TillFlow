import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import RemainingBalance from '@/components/RemainingBalance';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/format';
import { displayDocumentNumber } from '@/lib/reliability/walkthrough-contracts';
import { listOrphanCreditPurchases } from '@/lib/services/supplier-orphans';
import { assignOrphanPurchaseSupplierAction } from '@/app/actions/suppliers';

export const metadata = { title: 'Purchases without a supplier' };
export const dynamic = 'force-dynamic';

export default async function SupplierOrphansPage({
  searchParams,
}: {
  searchParams?: { error?: string; assigned?: string };
}) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const [orphans, suppliers] = await Promise.all([
    listOrphanCreditPurchases(business.id),
    prisma.supplier.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const canAssign = user.role === 'OWNER';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchases without a supplier"
        subtitle="Unpaid and part-paid purchases that are not attributed to a supplier account. They are excluded from supplier totals until assigned."
        secondaryCta={{ label: '← Back to suppliers', href: '/suppliers' }}
      />
      <FormError error={searchParams?.error} />
      {searchParams?.assigned === '1' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Supplier assigned. This purchase now appears on the supplier account.
        </div>
      ) : null}

      {orphans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center text-sm text-black/55">
          No orphan credit purchases. New unpaid purchases require a supplier.
        </div>
      ) : (
        <div className="space-y-3">
          {orphans.map((invoice) => (
            <div key={invoice.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/purchases/${invoice.id}`} className="font-mono text-sm font-semibold hover:underline">
                    {displayDocumentNumber('purchase', invoice.transactionNumber, invoice.id)}
                  </Link>
                  <div className="mt-1 text-xs text-black/50">{formatDateTime(invoice.createdAt)}</div>
                  <div className="mt-1 text-xs font-medium text-amber-700">{invoice.paymentStatus.replace('_', ' ')}</div>
                </div>
                <RemainingBalance
                  amountPence={invoice.totalPence}
                  paidPence={invoice.paidPence}
                  currency={business.currency}
                  className="min-w-[16rem]"
                />
              </div>
              {canAssign ? (
                <form action={assignOrphanPurchaseSupplierAction} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <select className="input" name="supplierId" required defaultValue="">
                    <option value="" disabled>
                      Select a supplier
                    </option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn-primary text-sm" type="submit">
                    Assign supplier
                  </button>
                </form>
              ) : (
                <p className="mt-3 text-xs text-black/50">Only the owner can assign a supplier to an orphan purchase.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
