import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import ResponsiveDataTable from '@/components/ResponsiveDataTable';
import { DataCard, DataCardActions, DataCardField, DataCardHeader } from '@/components/DataCard';
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
    return (
      <div className="space-y-4 sm:space-y-5">
        <PageHeader title="Stock Transfers" subtitle="Move inventory between branches." />
        <div className="card p-8 text-center">
          <div className="rounded-full bg-blue-50 p-3 inline-flex mb-3">
            <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-ink">Single-Branch Mode</h3>
          <p className="mt-2 text-sm text-muted max-w-md mx-auto">
            Stock transfers are only available when running in multi-branch mode.
            Switch to multi-branch mode in Settings &rarr; Branch Mode to enable branch transfers.
          </p>
          <a href="/settings" className="btn-secondary mt-4 inline-block text-sm">Go to Settings</a>
        </div>
      </div>
    );
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
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Stock Transfers"
        subtitle="Request branch transfers and complete them with manager approval."
      />

      <FormError error={searchParams?.error} />

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Create Transfer Request</h2>
        <form action={requestStockTransferAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">From Branch</label>
            <select className="input" name="fromStoreId" defaultValue={defaultFromStoreId} required>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">To Branch</label>
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

      <div className="card p-4">
        <ResponsiveDataTable
          mode="cards"
          mobileClassName="mobile-card-list lg:hidden"
          mobile={
            transfers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-black/10 bg-white px-4 py-10 text-center text-sm text-black/50">
                No stock transfers yet.
              </div>
            ) : (
              transfers.map((transfer) => {
                const line = transfer.lines[0];
                const statusBadge = (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      transfer.status === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {transfer.status}
                  </span>
                );

                return (
                  <DataCard key={transfer.id}>
                    <DataCardHeader
                      title={`${transfer.fromStore.name} -> ${transfer.toStore.name}`}
                      subtitle={formatDateTime(transfer.requestedAt)}
                      aside={statusBadge}
                    />
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <DataCardField label="Line" value={<span className="text-black/70">{line ? `${line.product.name} x ${line.qtyBase}` : '-'}</span>} className="col-span-2" />
                      <DataCardField label="Requested by" value={<span className="text-black/70">{transfer.requestedByUser.name}</span>} />
                      <DataCardField label="Approved by" value={<span className="text-black/70">{transfer.approvedByUser?.name ?? '-'}</span>} />
                    </div>
                    <DataCardActions>
                      {transfer.status === 'PENDING' ? (
                        <form action={approveStockTransferAction} className="grid w-full grid-cols-[1fr_auto] gap-2">
                          <input type="hidden" name="transferId" value={transfer.id} />
                          <input
                            className="input text-sm"
                            type="password"
                            name="managerPin"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="Manager PIN"
                            required
                          />
                          <SubmitButton className="btn-secondary text-sm" loadingText="Approving...">
                            Approve
                          </SubmitButton>
                        </form>
                      ) : (
                        <span className="text-xs text-black/40">Completed</span>
                      )}
                    </DataCardActions>
                  </DataCard>
                );
              })
            )
          }
          desktop={
            <div className="overflow-x-auto">
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
          }
        />
      </div>
    </div>
  );
}
