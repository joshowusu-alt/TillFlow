import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 30;

export default async function AnalyticsSettingsPage() {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  const events = await prisma.storefrontEvent.findMany({
    where: { businessId: business.id, timestamp: { gte: since } },
    select: { eventType: true, productId: true },
  });

  const counts = new Map<string, number>();
  const productViews = new Map<string, number>();
  for (const event of events) {
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
    if (event.eventType === 'PRODUCT_VIEW' && event.productId) {
      productViews.set(event.productId, (productViews.get(event.productId) ?? 0) + 1);
    }
  }

  const topProductIds = [...productViews.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  const topProducts = topProductIds.length
    ? await prisma.product.findMany({
        where: { id: { in: topProductIds }, businessId: business.id },
        select: { id: true, name: true },
      })
    : [];

  const productNameById = new Map(topProducts.map((p) => [p.id, p.name]));
  const views = counts.get('PRODUCT_VIEW') ?? 0;
  const addToCart = counts.get('ADD_TO_CART') ?? 0;
  const orders = counts.get('ORDER_PLACED') ?? 0;
  const conversionRate = views > 0 ? Math.round((orders / views) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Store Analytics"
        subtitle={`Online storefront activity in the last ${WINDOW_DAYS} days.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-black/40">Product views</div>
          <div className="mt-2 text-3xl font-bold text-ink">{views.toLocaleString()}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-black/40">Add to cart</div>
          <div className="mt-2 text-3xl font-bold text-ink">{addToCart.toLocaleString()}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-black/40">Orders placed</div>
          <div className="mt-2 text-3xl font-bold text-ink">{orders.toLocaleString()}</div>
          <p className="mt-1 text-xs text-black/50">
            View → order rate: {conversionRate}%
          </p>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Top viewed products</h2>
        {topProductIds.length === 0 ? (
          <p className="text-sm text-black/60">
            No storefront views recorded yet. Traffic appears here once customers browse your online store.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {topProductIds.map((productId) => (
              <li key={productId} className="flex justify-between gap-4 border-b border-black/5 pb-2">
                <span className="font-medium text-ink">{productNameById.get(productId) ?? productId}</span>
                <span className="text-black/50">{productViews.get(productId)?.toLocaleString()} views</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-black/50">
          Totals are stored on your TillFlow database from storefront events — not a third-party analytics SDK.
        </p>
      </div>

      <div className="card p-4 text-sm text-black/60">
        Paid online revenue is tracked under{' '}
        <Link href="/online-orders" className="font-semibold text-accent hover:underline">
          Online orders
        </Link>
        . This page focuses on browsing and conversion signals.
      </div>

      <div className="flex">
        <Link href="/settings" className="btn-secondary text-sm">
          ← Back to Settings
        </Link>
      </div>
    </div>
  );
}
