import SectionHeading from '@/components/section-heading';
import { requireControlStaff } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';
import { formatCedi, getPortfolioSummaryFor, getRevenueByPlanFor } from '@/lib/control-metrics';

export default async function RevenuePage() {
  await requireControlStaff();
  const businesses = await listManagedBusinesses();
  const summary = getPortfolioSummaryFor(businesses);
  const revenueByPlan = getRevenueByPlanFor(businesses);

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <SectionHeading
          eyebrow="Revenue view"
          title="Portfolio revenue, not just account status"
          description="This is where Tishgroup sees whether the business model is healthy: MRR, ARR, plan mix, expected collections, and what revenue is currently exposed to non-payment."
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card">
          <div className="eyebrow">MRR</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-control-ink">{formatCedi(summary.mrr)}</div>
          <p className="mt-3 text-sm leading-6 text-black/62">Current monthly-equivalent revenue across all active subscriptions and annual contracts.</p>
        </div>
        <div className="metric-card">
          <div className="eyebrow">ARR</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-control-ink">{formatCedi(summary.arr)}</div>
          <p className="mt-3 text-sm leading-6 text-black/62">Simple annualized run-rate based on the current portfolio mix.</p>
        </div>
        <div className="metric-card">
          <div className="eyebrow">Expected collections</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-control-ink">{formatCedi(summary.expectedCollections)}</div>
          <p className="mt-3 text-sm leading-6 text-black/62">Cash at risk across due-soon, overdue, fallback, and locked accounts.</p>
        </div>
        <div className="metric-card">
          <div className="eyebrow">Active paid accounts</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-control-ink">{summary.activePaid}</div>
          <p className="mt-3 text-sm leading-6 text-black/62">Accounts paying and operating without current billing pressure.</p>
        </div>
      </section>

      <section className="panel p-6">
        <SectionHeading
          eyebrow="Plan economics"
          title="Revenue by sold plan"
          description="This gives a clean commercial read: where the customer base sits now, and whether Tishgroup is still too dependent on lower-value accounts."
        />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {revenueByPlan.map((entry) => (
            <div key={entry.plan} className="rounded-2xl border border-black/8 bg-white/80 p-5">
              <div className="eyebrow">{entry.plan}</div>
              <div className="mt-3 text-2xl font-semibold text-control-ink">{formatCedi(entry.revenue)}</div>
              <div className="mt-2 text-sm text-black/62">{entry.count} business{entry.count === 1 ? '' : 'es'} sold on this tier.</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}