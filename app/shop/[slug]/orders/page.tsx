import Link from 'next/link';
import { notFound } from 'next/navigation';
import OrderLookupClient from './OrderLookupClient';
import { formatDate, formatMoney, formatOnlineOrderStatus } from '@/lib/format';
import { getOrdersByPhone, getPublicStorefrontBySlug } from '@/lib/services/online-orders';

export const dynamic = 'force-dynamic';

export default async function StorefrontOrdersPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { phone?: string | string[] };
}) {
  const storefront = await getPublicStorefrontBySlug(params.slug);
  if (!storefront) {
    notFound();
  }

  const phoneParam = Array.isArray(searchParams?.phone) ? searchParams?.phone[0] : searchParams?.phone;
  const trimmedPhone = phoneParam?.trim() ?? '';
  const results = trimmedPhone ? await getOrdersByPhone(params.slug, trimmedPhone) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Order lookup</div>
          <h1 className="mt-2 text-3xl font-display font-bold text-ink">Find your {storefront.name} orders</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">
            Enter the phone number you used at checkout to view recent orders and jump back into live payment tracking.
          </p>
        </div>

        <OrderLookupClient slug={params.slug} initialPhone={trimmedPhone} />

        <div className="mt-6 space-y-4">
          {!trimmedPhone ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center text-sm text-black/55">
              Enter your phone number above to find the latest orders for this store.
            </div>
          ) : results && results.orders.length > 0 ? (
            results.orders.map((order) => (
              <div key={order.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-ink">{order.orderNumber}</h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {formatOnlineOrderStatus(order.status)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-black/55">
                      {formatDate(new Date(order.createdAt))} · {order.customerName}
                    </div>
                    <div className="mt-3 text-sm text-black/65">
                      {order.lines.map((line) => `${line.productName} × ${line.qtyInUnit} ${line.unitName}`).join(', ')}
                    </div>
                    <div className="mt-2 text-xs text-black/45">Payment: {order.paymentStatus}</div>
                  </div>

                  <div className="shrink-0 text-left sm:text-right">
                    <div className="text-lg font-bold text-ink">{formatMoney(order.totalPence, order.currency)}</div>
                    <Link
                      href={`/shop/${params.slug}/orders/${order.id}?token=${encodeURIComponent(order.publicToken)}`}
                      className="mt-3 inline-flex items-center justify-center rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent/30 hover:text-accent"
                    >
                      View order
                    </Link>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-10 text-center">
              <div className="text-sm font-semibold text-ink">No matching orders found</div>
              <div className="mt-1 text-xs text-black/50">
                Try the same number you used during checkout, in either 024… or 233… format.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
