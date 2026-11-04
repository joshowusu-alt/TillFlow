import { notFound } from 'next/navigation';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { ReportScopeLabel } from '@/components/reports/ReportSurfaceDenial';
import { addCalendarDays } from '@/lib/entitlements/range';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { prisma } from '@/lib/prisma';
import { defaultTenantLocalRange, halfOpenTimestampFilter } from '@/lib/reports/reporting-clock';
export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 30;

export default async function AnalyticsSettingsPage(
  props: {
    searchParams?: Promise<{ storeId?: string; businessId?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const opened = await openLiveReport({
    surfaceId: 'storefront_analytics',
    search: searchParams,
    range: ({ timezone, now }) => {
      const today = formatBusinessLocalDateKey(now, timezone);
      return { fromLocalDate: addCalendarDays(today, -29), toLocalDate: today, preset: 'CUSTOM' };
    },
  });
  if (!opened.ok) return opened.denial;
  const { business } = opened;
  if (opened.branch.kind !== 'label') notFound();

  const range = defaultTenantLocalRange(new Date(), business.timezone, WINDOW_DAYS);

  const dateLabel = new Intl.DateTimeFormat('en-GB', { timeZone: range.timeZone, day: 'numeric', month: 'short', year: 'numeric' });

  const events = await prisma.storefrontEvent.findMany({
    where: { businessId: business.id, timestamp: halfOpenTimestampFilter(range) },
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
      <ReportScopeLabel label={opened.branch.label} />
      <PageHeader
        title="Store Analytics"
        subtitle={`Online storefront activity in the last ${WINDOW_DAYS} days.`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white p-4 text-sm">
        <p className="text-muted">{dateLabel.format(range.startInclusive)} – {dateLabel.format(new Date(range.endExclusive.getTime() - 1))} · {range.timeZone}</p>
        <Link href="/settings/online-store" className="btn-secondary min-h-11 text-sm">Manage online store</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-black/40">Product views</div>
          <div className="mt-2 text-3xl font-bold text-ink">{views.toLocaleString()}</div>
          <p className="mt-1 text-xs text-muted">Times customers opened a product.</p>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-black/40">Add to cart</div>
          <div className="mt-2 text-3xl font-bold text-ink">{addToCart.toLocaleString()}</div>
          <p className="mt-1 text-xs text-muted">Recorded additions to a shopping cart.</p>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-black/40">Orders placed</div>
          <div className="mt-2 text-3xl font-bold text-ink">{orders.toLocaleString()}</div>
          <p className="mt-1 text-xs text-black/50">
            View → order rate: {conversionRate}%
          </p>
        </div>
      </div>

      <div className="card min-w-0 p-4 sm:p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold text-ink">Top viewed products</h2>
        {topProductIds.length === 0 ? (
          <p className="text-sm text-black/60">
            No storefront views recorded yet. Traffic appears here once customers browse your online store. Share your store link from Online store settings to get started.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {topProductIds.map((productId) => (
              <li key={productId} className="flex min-w-0 items-start justify-between gap-4 border-b border-black/5 pb-2">
                <span className="min-w-0 break-words font-medium text-ink">{productNameById.get(productId) ?? 'Unavailable product'}</span>
                <span className="shrink-0 text-black/50">{productViews.get(productId)?.toLocaleString()} views</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-black/50">
          These figures count browsing actions, so repeat visits can be counted more than once. The view-to-order rate compares recorded order events with product views.
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
