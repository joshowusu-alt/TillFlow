import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import SubmitButton from '@/components/SubmitButton';
import { formatDateTime, formatMoney } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import {
  recheckMomoCollectionAction,
  reconcilePendingMomoCollectionsAction,
  reinitiateMomoCollectionAction,
} from '@/app/actions/mobile-money';

export default async function MomoReconciliationPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);

  const collections = await prisma.mobileMoneyCollection.findMany({
    where: { businessId: business.id },
    orderBy: { initiatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      provider: true,
      network: true,
      payerMsisdn: true,
      amountPence: true,
      currency: true,
      status: true,
      providerStatus: true,
      providerReference: true,
      providerTransactionId: true,
      failureReason: true,
      initiatedAt: true,
      confirmedAt: true,
      lastCheckedAt: true,
      salesInvoiceId: true,
    },
  });

  const totals = collections.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="MoMo Reconciliation"
        subtitle="Track pending, failed and confirmed collections. Re-check status before retrying."
      />

      {searchParams?.error ? (
        <div className="rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">
          {searchParams.error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs text-black/50">Pending</div>
          <div className="text-2xl font-semibold text-amber-700">{totals.PENDING ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-black/50">Confirmed</div>
          <div className="text-2xl font-semibold text-emerald-700">{totals.CONFIRMED ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-black/50">Failed</div>
          <div className="text-2xl font-semibold text-rose">{totals.FAILED ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-black/50">Timeout</div>
          <div className="text-2xl font-semibold text-rose">{totals.TIMEOUT ?? 0}</div>
        </div>
      </div>

      <div className="card p-4">
        <form action={reconcilePendingMomoCollectionsAction}>
          <SubmitButton className="btn-secondary text-xs" loadingText="Reconciling...">
            Reconcile Pending Collections
          </SubmitButton>
        </form>
      </div>

      <div className="card overflow-x-auto p-4">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Initiated</th>
              <th>Payer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Provider Ref</th>
              <th>Sale</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {collections.map((collection) => {
              const statusTone =
                collection.status === 'CONFIRMED'
                  ? 'bg-emerald-100 text-emerald-700'
                  : collection.status === 'PENDING'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-700';
              const reference =
                collection.providerTransactionId ??
                collection.providerReference ??
                collection.id.slice(0, 8);
              const canReinitiate = collection.status === 'FAILED' || collection.status === 'TIMEOUT';

              return (
                <tr key={collection.id} className="rounded-xl bg-white align-top">
                  <td className="px-3 py-3 text-xs">
                    <div>{formatDateTime(collection.initiatedAt)}</div>
                    {collection.lastCheckedAt ? (
                      <div className="text-black/50">Checked: {formatDateTime(collection.lastCheckedAt)}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    <div className="font-semibold">{collection.payerMsisdn}</div>
                    <div className="text-xs text-black/50">
                      {collection.network} | {collection.provider}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {formatMoney(collection.amountPence, collection.currency || business.currency)}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    <span className={`pill ${statusTone}`}>{collection.status}</span>
                    <div className="mt-1 text-[11px] text-black/50">{collection.providerStatus ?? '-'}</div>
                    {collection.failureReason ? (
                      <div className="mt-1 text-[11px] text-rose">{collection.failureReason}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-xs font-mono">{reference}</td>
                  <td className="px-3 py-3 text-xs">
                    {collection.salesInvoiceId ? (
                      <Link
                        className="text-emerald-700 hover:underline"
                        href={`/receipts/${collection.salesInvoiceId}`}
                      >
                        {collection.salesInvoiceId.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-black/40">Not linked</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-2">
                      <form action={recheckMomoCollectionAction}>
                        <input type="hidden" name="collectionId" value={collection.id} />
                        <SubmitButton className="btn-ghost text-xs w-full" loadingText="Checking...">
                          Re-check
                        </SubmitButton>
                      </form>
                      {canReinitiate ? (
                        <form action={reinitiateMomoCollectionAction}>
                          <input type="hidden" name="collectionId" value={collection.id} />
                          <SubmitButton className="btn-secondary text-xs w-full" loadingText="Retrying...">
                            Re-initiate
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {collections.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-black/50">
                  No mobile money collections yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
