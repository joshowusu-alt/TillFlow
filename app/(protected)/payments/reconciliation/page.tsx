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

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

export default async function MomoReconciliationPage({
  searchParams,
}: {
  searchParams?: { error?: string; from?: string; to?: string; storeId?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const from = parseDate(searchParams?.from, weekAgo);
  const to = parseDate(searchParams?.to, today);
  to.setHours(23, 59, 59, 999);

  const stores = await prisma.store.findMany({
    where: { businessId: business.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const selectedStoreId =
    searchParams?.storeId && stores.some((store) => store.id === searchParams.storeId)
      ? searchParams.storeId
      : 'ALL';

  const collections = await prisma.mobileMoneyCollection.findMany({
    where: {
      businessId: business.id,
      ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
      initiatedAt: { gte: from, lte: to },
    },
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

      <form className="card grid gap-3 p-4 sm:grid-cols-4" method="GET">
        <div>
          <label className="label">Branch / Store</label>
          <select className="input" name="storeId" defaultValue={selectedStoreId}>
            <option value="ALL">All branches</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input className="input" type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} />
        </div>
        <div className="flex items-end">
          <button className="btn-secondary w-full" type="submit">
            Apply
          </button>
        </div>
      </form>

      {searchParams?.error ? (
        <div className="rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">
          {/env|config|missing|not.set|undefined/i.test(searchParams.error) ? (
            <div>
              <strong>MoMo is not fully connected.</strong>
              <p className="mt-1 text-xs text-rose/80">Your MoMo credentials haven&apos;t been set up yet. Payments can&apos;t be processed until this is fixed.</p>
              <div className="mt-2 flex items-center gap-3">
                <a href="/settings" className="rounded-lg bg-rose px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition">
                  Connect MoMo →
                </a>
                <details className="text-xs">
                  <summary className="cursor-pointer text-rose/70 hover:text-rose">Show technical details</summary>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] opacity-70">{searchParams.error}</pre>
                </details>
              </div>
            </div>
          ) : (
            searchParams.error
          )}
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
              <th>Status
                <span className="tooltip-wrap ml-1 cursor-help align-middle">
                  <svg className="inline h-3.5 w-3.5 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="tooltip-content">
                    <strong>Status Glossary</strong><br />
                    <br />
                    <strong>Pending</strong> — Payment initiated, waiting for customer to approve on their phone.<br />
                    <strong>Confirmed</strong> — Customer approved. Funds are on the way.<br />
                    <strong>Reconciled</strong> — Confirmed and matched to a sale in TillFlow.<br />
                    <strong>Failed</strong> — Customer declined or an error occurred. You can retry.<br />
                    <strong>Timeout</strong> — No response received. Re-check or re-initiate.
                  </span>
                </span>
              </th>
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
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-rose hover:underline">Payment failed — Show reason</summary>
                        <div className="mt-0.5 text-[11px] text-rose/80 font-mono">{collection.failureReason}</div>
                      </details>
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
