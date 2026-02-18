import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requestStockTransferAction, approveStockTransferAction } from '@/app/actions/transfers';
import { formatDateTime } from '@/lib/format';
import { redirect } from 'next/navigation';

export default async function TransfersPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);

  if ((business as any).storeMode !== 'MULTI_STORE') {
    redirect('/pos');
  }

  const [stores, products, transfers] = await Promise.all([
    prisma.store.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      where: { businessId: business.id, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    prisma.stockTransfer.findMany({
      where: { businessId: business.id },
      include: {
        fromStore: { select: { name: true } },
        toStore: { select: { name: true } },
        requestedByUser: { select: { name: true } },
        approvedByUser: { select: { name: true } },
        lines: {
          include: {
            product: { select: { name: true } },
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    }),
  ]);

  const defaultFromStoreId = stores[0]?.id ?? '';
  const defaultToStoreId = stores.length > 1 ? stores[1].id : stores[0]?.id ?? '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Transfers"
        subtitle="Request branch transfers and complete them with manager approval."
      />

      <FormError error={searchParams?.error} />

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Create Transfer Request</h2>
        <form action={requestStockTransferAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">From Branch / Store</label>
            <select className="input" name="fromStoreId" defaultValue={defaultFromStoreId} required>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">To Branch / Store</label>
            <select className="input" name="toStoreId" defaultValue={defaultToStoreId} required>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Product</label>
            <select className="input" name="productId" required>
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Quantity (base units)</label>
            <input className="input" type="number" name="qtyBase" min={1} step={1} required />
          </div>
          <div className="md:col-span-2">
            <label className="label">Reason (optional)</label>
            <input className="input" name="reason" placeholder="Why this transfer is needed" />
          </div>
          <div className="md:col-span-2">
            <SubmitButton className="btn-primary" loadingText="Creating transfer...">
              Request Transfer
            </SubmitButton>
          </div>
        </form>
      </div>

      <div className="card overflow-x-auto p-4">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Requested</th>
              <th>From</th>
              <th>To</th>
              <th>Line</th>
              <th>Status</th>
              <th>Requested By</th>
              <th>Approved By</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((transfer) => {
              const line = transfer.lines[0];
              return (
                <tr key={transfer.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 text-xs">{formatDateTime(transfer.requestedAt)}</td>
                  <td className="px-3 py-3 text-sm">{transfer.fromStore.name}</td>
                  <td className="px-3 py-3 text-sm">{transfer.toStore.name}</td>
                  <td className="px-3 py-3 text-sm">
                    {line ? `${line.product.name} x ${line.qtyBase}` : '-'}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        transfer.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {transfer.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs">{transfer.requestedByUser.name}</td>
                  <td className="px-3 py-3 text-xs">{transfer.approvedByUser?.name ?? '-'}</td>
                  <td className="px-3 py-3">
                    {transfer.status === 'PENDING' ? (
                      <form action={approveStockTransferAction} className="flex gap-2">
                        <input type="hidden" name="transferId" value={transfer.id} />
                        <input
                          className="input h-9 text-xs"
                          type="password"
                          name="managerPin"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="Manager PIN"
                          required
                        />
                        <SubmitButton className="btn-secondary text-xs" loadingText="Approving...">
                          Approve
                        </SubmitButton>
                      </form>
                    ) : (
                      <span className="text-xs text-black/40">Completed</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {transfers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-black/50">
                  No stock transfers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
