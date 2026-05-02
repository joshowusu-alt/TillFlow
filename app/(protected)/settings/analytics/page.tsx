import Link from 'next/link';
import PageHeader from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function AnalyticsSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Store Analytics"
        subtitle="Understand how customers interact with your online storefront."
      />

      <div className="card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-base">
            📊
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">How analytics work</h2>
            <p className="text-sm text-black/60 leading-relaxed">
              Store analytics are tracked locally. Customer-side events (views, add-to-cart, orders)
              are recorded in each customer&apos;s browser and visible in the browser console during
              development.
            </p>
            <p className="text-sm text-black/60 leading-relaxed">
              A cloud analytics dashboard will be available in a future update, giving you full
              visibility into storefront traffic, conversion rates, and popular products.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-medium text-amber-800">
            🚧 Cloud analytics dashboard — coming soon
          </p>
        </div>
      </div>

      <div className="flex">
        <Link href="/settings" className="btn-secondary text-sm">
          ← Back to Settings
        </Link>
      </div>
    </div>
  );
}
