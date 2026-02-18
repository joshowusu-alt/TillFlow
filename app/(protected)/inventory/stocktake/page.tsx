import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import Link from 'next/link';
import StocktakeClient from './StocktakeClient';

export default async function StocktakePage() {
  const { business, store } = await requireBusinessStore(['MANAGER', 'OWNER']);
  if (!business || !store) {
    return <div className="card p-6">Seed data missing.</div>;
  }

  const [inProgress, pastStocktakes, products] = await Promise.all([
    prisma.stocktake.findFirst({
      where: { storeId: store.id, status: 'IN_PROGRESS' },
      include: {
        lines: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                barcode: true,
                productUnits: {
                  where: { isBaseUnit: true },
                  select: { unit: { select: { name: true, pluralName: true } } },
                },
              },
            },
          },
          orderBy: { product: { name: 'asc' } },
        },
        user: { select: { name: true } },
      },
    }),
    prisma.stocktake.findMany({
      where: { storeId: store.id, status: { not: 'IN_PROGRESS' } },
      include: {
        user: { select: { name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.product.findMany({
      where: { businessId: business.id, active: true },
      select: { id: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stocktake"
        subtitle="Physical inventory count with variance reconciliation."
        actions={
          <Link className="btn-secondary text-xs" href="/inventory">
            ← Back to Inventory
          </Link>
        }
      />

      {inProgress ? (
        <StocktakeClient
          stocktakeId={inProgress.id}
          lines={inProgress.lines.map((l) => ({
            id: l.id,
            productId: l.productId,
            productName: l.product.name,
            barcode: l.product.barcode,
            baseUnit: l.product.productUnits[0]?.unit.name ?? 'unit',
            baseUnitPlural: l.product.productUnits[0]?.unit.pluralName ?? 'units',
            expectedBase: l.expectedBase,
            countedBase: l.countedBase,
          }))}
          startedBy={inProgress.user.name ?? 'Unknown'}
          startedAt={inProgress.createdAt.toISOString()}
        />
      ) : (
        <div className="card p-8 text-center space-y-4">
          <div className="rounded-full bg-accentSoft p-4 mx-auto w-fit">
            <svg className="h-8 w-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Start a Physical Count</h3>
            <p className="text-sm text-black/50 mt-1">
              This will snapshot the current system quantities for all {products.length} active products
              so you can count and compare.
            </p>
          </div>
          <form action={async () => {
            'use server';
            const { createStocktakeAction } = await import('@/app/actions/stocktake');
            const result = await createStocktakeAction();
            if (!result.success) throw new Error(result.error);
            const { redirect } = await import('next/navigation');
            redirect('/inventory/stocktake');
          }}>
            <button type="submit" className="btn-primary">
              Start Stocktake ({products.length} products)
            </button>
          </form>
        </div>
      )}

      {/* Past stocktakes */}
      {pastStocktakes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-black/50 uppercase tracking-wider">Past Stocktakes</h3>
          <div className="card overflow-hidden">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>By</th>
                  <th>Products</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pastStocktakes.map((st) => (
                  <tr key={st.id}>
                    <td className="px-3 py-2 text-sm">{formatDateTime(st.createdAt)}</td>
                    <td className="px-3 py-2 text-sm">{st.user.name}</td>
                    <td className="px-3 py-2 text-sm">{st._count.lines}</td>
                    <td className="px-3 py-2 text-sm">
                      {st.status === 'COMPLETED' ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Completed</span>
                      ) : (
                        <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold text-black/50">Cancelled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
