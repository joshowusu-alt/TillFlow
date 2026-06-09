import { Metadata } from 'next';
import Link from 'next/link';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import StorefrontUpgradeNotice from '@/components/StorefrontUpgradeNotice';
import PageHeader from '@/components/PageHeader';

export const metadata: Metadata = { title: 'Storefront Analytics' };

type Stat = { label: string; value: string | number; sub?: string; tone?: 'green' | 'amber' | 'red' | 'neutral' };

function StatCard({ stat }: { stat: Stat }) {
  const toneClass =
    stat.tone === 'green'
      ? 'text-emerald-700'
      : stat.tone === 'amber'
        ? 'text-amber-700'
        : stat.tone === 'red'
          ? 'text-red-700'
          : 'text-ink';
  return (
    <div className="rounded-xl border border-edge bg-surface p-4 flex flex-col gap-1">
      <p className="text-xs font-medium text-dim uppercase tracking-wide">{stat.label}</p>
      <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{stat.value}</p>
      {stat.sub && <p className="text-xs text-dim">{stat.sub}</p>}
    </div>
  );
}

function FunnelBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 text-sm text-dim text-right">{label}</span>
      <div className="flex-1 h-5 rounded-full bg-edge overflow-hidden">
        <div
          className="h-full rounded-full bg-primary-500 transition-all"
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span className="w-16 text-sm font-semibold tabular-nums text-ink text-right">{count.toLocaleString()}</span>
      <span className="w-12 text-xs text-dim text-right">{pct}%</span>
    </div>
  );
}

export default async function StorefrontAnalyticsPage() {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  const addonOnlineStorefront = (business as any).addonOnlineStorefront ?? false;
  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any,
    { onlineStorefront: addonOnlineStorefront },
  );

  if (!features.onlineStorefront) {
    return <StorefrontUpgradeNotice plan={features.plan} featureName="Storefront analytics" />;
  }

  const now = Date.now();
  const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const prevPeriodStart = new Date(now - 60 * 24 * 60 * 60 * 1000);

  const [counts30, counts7, countsPrev, topProductRows, recentOrders] = await Promise.all([
    prisma.storefrontEvent.groupBy({
      by: ['eventType'],
      where: { businessId: business.id, timestamp: { gte: since30 } },
      _count: { _all: true },
    }),
    prisma.storefrontEvent.groupBy({
      by: ['eventType'],
      where: { businessId: business.id, timestamp: { gte: since7 } },
      _count: { _all: true },
    }),
    prisma.storefrontEvent.groupBy({
      by: ['eventType'],
      where: { businessId: business.id, timestamp: { gte: prevPeriodStart, lt: since30 } },
      _count: { _all: true },
    }),
    prisma.storefrontEvent.groupBy({
      by: ['productId', 'eventType'],
      where: {
        businessId: business.id,
        productId: { not: null },
        timestamp: { gte: since30 },
        eventType: { in: ['product_view', 'add_to_cart', 'order_placed'] },
      },
      _count: { _all: true },
    }),
    prisma.onlineOrder.count({
      where: { businessId: business.id, createdAt: { gte: since30 } },
    }),
  ]);

  // Map event counts
  const c30 = new Map(counts30.map((e) => [e.eventType, e._count._all]));
  const c7 = new Map(counts7.map((e) => [e.eventType, e._count._all]));
  const cPrev = new Map(countsPrev.map((e) => [e.eventType, e._count._all]));

  const visits30 = c30.get('view') ?? 0;
  const productViews30 = c30.get('product_view') ?? 0;
  const addToCart30 = c30.get('add_to_cart') ?? 0;
  const checkoutStarts30 = c30.get('checkout_start') ?? 0;
  const ordersPlaced30 = c30.get('order_placed') ?? 0;
  const conversionRate = visits30 > 0 ? ((ordersPlaced30 / visits30) * 100).toFixed(1) : '0.0';

  const visits7 = c7.get('view') ?? 0;
  const ordersPlaced7 = c7.get('order_placed') ?? 0;
  const visitsPrev = cPrev.get('view') ?? 0;
  const ordersPlacedPrev = cPrev.get('order_placed') ?? 0;

  function trend(current: number, prev: number): string {
    if (prev === 0 && current === 0) return '';
    if (prev === 0) return `+${current} vs prev 30d`;
    const pct = Math.round(((current - prev) / prev) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}% vs prev 30d`;
  }

  // Top products by views
  type ProductRow = { productId: string | null; eventType: string; _count: { _all: number } };
  const productViews = new Map<string, number>();
  const productCarts = new Map<string, number>();
  const productOrders = new Map<string, number>();
  for (const row of topProductRows as ProductRow[]) {
    if (!row.productId) continue;
    if (row.eventType === 'product_view') productViews.set(row.productId, row._count._all);
    if (row.eventType === 'add_to_cart') productCarts.set(row.productId, row._count._all);
    if (row.eventType === 'order_placed') productOrders.set(row.productId, row._count._all);
  }
  const topProductIds = [...productViews.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  let productNames: Map<string, string> = new Map();
  if (topProductIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, name: true },
    });
    productNames = new Map(products.map((p) => [p.id, p.name]));
  }

  const hasAnyData = visits30 > 0 || ordersPlaced30 > 0 || recentOrders > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Storefront analytics" subtitle="Last 30 days" />
        <Link
          href="/settings/online-store"
          className="text-sm text-dim hover:text-ink transition-colors"
        >
          ← Settings
        </Link>
      </div>

      {!hasAnyData ? (
        <div className="rounded-xl border border-edge bg-surface p-8 text-center">
          <p className="text-lg font-semibold text-ink mb-1">No data yet</p>
          <p className="text-sm text-dim">Analytics will appear once customers visit your storefront.</p>
        </div>
      ) : (
        <>
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              stat={{
                label: 'Store visits',
                value: visits30.toLocaleString(),
                sub: trend(visits30, visitsPrev),
              }}
            />
            <StatCard
              stat={{
                label: 'Product views',
                value: productViews30.toLocaleString(),
              }}
            />
            <StatCard
              stat={{
                label: 'Added to cart',
                value: addToCart30.toLocaleString(),
              }}
            />
            <StatCard
              stat={{
                label: 'Orders placed',
                value: ordersPlaced30.toLocaleString(),
                sub: trend(ordersPlaced30, ordersPlacedPrev),
                tone: ordersPlaced30 > 0 ? 'green' : 'neutral',
              }}
            />
            <StatCard
              stat={{
                label: 'Conversion',
                value: `${conversionRate}%`,
                sub: 'visits → orders',
                tone:
                  parseFloat(conversionRate) >= 5
                    ? 'green'
                    : parseFloat(conversionRate) >= 1
                      ? 'amber'
                      : 'neutral',
              }}
            />
          </div>

          {/* This week */}
          <div className="rounded-xl border border-edge bg-surface p-4">
            <p className="text-xs font-semibold text-dim uppercase tracking-wide mb-3">This week (7 days)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-2xl font-bold tabular-nums text-ink">{visits7.toLocaleString()}</p>
                <p className="text-xs text-dim">Visits</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-ink">{(c7.get('product_view') ?? 0).toLocaleString()}</p>
                <p className="text-xs text-dim">Product views</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-ink">{(c7.get('add_to_cart') ?? 0).toLocaleString()}</p>
                <p className="text-xs text-dim">Added to cart</p>
              </div>
              <div>
                <p className={`text-2xl font-bold tabular-nums ${ordersPlaced7 > 0 ? 'text-emerald-700' : 'text-ink'}`}>
                  {ordersPlaced7.toLocaleString()}
                </p>
                <p className="text-xs text-dim">Orders</p>
              </div>
            </div>
          </div>

          {/* Conversion funnel */}
          <div className="rounded-xl border border-edge bg-surface p-4">
            <p className="text-xs font-semibold text-dim uppercase tracking-wide mb-4">Conversion funnel (30 days)</p>
            <div className="space-y-3">
              <FunnelBar label="Visits" count={visits30} max={visits30} />
              <FunnelBar label="Product views" count={productViews30} max={visits30} />
              <FunnelBar label="Added to cart" count={addToCart30} max={visits30} />
              <FunnelBar label="Checkout started" count={checkoutStarts30} max={visits30} />
              <FunnelBar label="Orders placed" count={ordersPlaced30} max={visits30} />
            </div>
            {visits30 > 0 && addToCart30 > 0 && ordersPlaced30 === 0 && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                Customers are adding items to cart but not completing checkout. Check your payment settings and checkout experience.
              </p>
            )}
            {visits30 > 0 && addToCart30 === 0 && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                Customers are visiting but not adding items to cart. Consider improving product descriptions and pricing.
              </p>
            )}
          </div>

          {/* Top products */}
          {topProductIds.length > 0 && (
            <div className="rounded-xl border border-edge bg-surface p-4">
              <p className="text-xs font-semibold text-dim uppercase tracking-wide mb-4">Top viewed products (30 days)</p>
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm min-w-[400px]">
                  <thead>
                    <tr className="border-b border-edge">
                      <th className="text-left pb-2 font-medium text-dim">Product</th>
                      <th className="text-right pb-2 font-medium text-dim w-16">Views</th>
                      <th className="text-right pb-2 font-medium text-dim w-16">Cart</th>
                      <th className="text-right pb-2 font-medium text-dim w-16">Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {topProductIds.map((id) => (
                      <tr key={id}>
                        <td className="py-2 text-ink font-medium truncate max-w-[200px]">
                          {productNames.get(id) ?? id.slice(-6)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-dim">
                          {(productViews.get(id) ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2 text-right tabular-nums text-dim">
                          {(productCarts.get(id) ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2 text-right tabular-nums font-semibold text-ink">
                          {(productOrders.get(id) ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-dim text-center">
            Analytics track anonymous sessions. No personal data is stored.{' '}
            <Link href="/settings/online-store" className="underline hover:text-ink">
              Back to settings
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
