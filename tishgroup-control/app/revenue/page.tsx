import Link from 'next/link';
import ControlPageHeader from '@/components/control-page-header';
import SectionHeading from '@/components/section-heading';
import { requireControlStaff } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';
import { formatCedi, getPortfolioSummaryFor, getRevenueByPlanFor } from '@/lib/control-metrics';

export const dynamic = 'force-dynamic';

export default async function RevenuePage() {
  await requireControlStaff();
  const businesses = await listManagedBusinesses();
  const summary = getPortfolioSummaryFor(businesses);
  const revenueByPlan = getRevenueByPlanFor(businesses);
  const riskCards = [
    {
      label: 'Due soon',
      value: summary.dueSoon,
      href: '/collections#dueSoon',
      note: 'Accounts needing reminder before overdue handling starts.',
    },
    {
      label: 'In grace',
      value: summary.grace,
      href: '/collections#overdue',
      note: 'Revenue already exposed to same-day follow-up risk.',
    },
    {
      label: 'Fallback and locked',
      value: summary.fallback + summary.readOnly,
      href: '/collections#locked',
      note: 'Accounts already degraded or blocked by billing state.',
    },
  ];
  const headerStats = [
    {
      label: 'MRR',
      value: formatCedi(summary.mrr),
      hint: 'Current monthly-equivalent recurring revenue across the managed portfolio.',
    },
    {
      label: 'ARR',
      value: formatCedi(summary.arr),
      hint: 'Simple annualized run-rate based on the current sold-plan base.',
    },
    {
      label: 'Expected collections',
      value: formatCedi(summary.expectedCollections),
      hint: 'Cash that needs active follow-up rather than passive reporting.',
    },
    {
      label: 'Active paid accounts',
      value: String(summary.activePaid),
      hint: 'Accounts currently paying and operating without immediate billing pressure.',
    },
  ];

  return (
    <div className="space-y-6">
      <ControlPageHeader
        eyebrow="Revenue view"
        title="Portfolio revenue, not just account status."
        description="Read this page like an operating review: what the portfolio produces, where cash is exposed, and which collections lane should get the next team action."
        chips={[
          { label: 'Revenue summary', href: '#revenue-summary' },
          { label: 'Protection sequence', href: '#protection-sequence', tone: 'dark' },
          { label: 'Risk lanes', href: '#risk-lanes' },
          { label: 'Plan economics', href: '#plan-economics' },
        ]}
        stats={headerStats}
        aside={(
          <div className="space-y-5">
            <div>
              <div className="eyebrow">Protection order</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Move revenue risk before it compounds</h2>
              <p className="mt-3 text-sm leading-7">
                The point of this page is to route people into the right collections lane and keep the portfolio away from fallback dependency.
              </p>
            </div>

            <div className="control-priority-list">
              {riskCards.map((card, index) => (
                <Link key={card.label} href={card.href} className="control-priority-item control-priority-item-tonal block">
                  <div className="flex items-start gap-3">
                    <span className="control-sequence-step">{index + 1}</span>
                    <div>
                      <div className="font-semibold">{card.label}</div>
                      <div className="mt-1 text-sm text-white/70">{card.note}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      />

      <section id="revenue-summary" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      <section id="protection-sequence" className="panel p-6">
        <SectionHeading
          eyebrow="Protection sequence"
          title="The commercial order of operations"
          description="This is the Chargebee-style layer: use revenue data to decide who needs reminders, who needs same-day recovery work, and where restricted access should stay in place."
        />

        <div className="control-sequence-grid mt-5 md:grid-cols-3">
          {riskCards.map((card, index) => (
            <Link key={card.label} href={card.href} className="control-sequence-card block transition hover:-translate-y-[1px] hover:shadow-lg">
              <div className="flex items-center justify-between gap-3">
                <span className="control-sequence-step">Step {index + 1}</span>
                <div className="text-sm font-semibold text-control-ink">{card.value}</div>
              </div>
              <div className="mt-4 text-lg font-semibold text-control-ink">{card.label}</div>
              <p className="mt-3 text-sm leading-6 text-black/62">{card.note}</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="risk-lanes" className="panel p-6">
        <SectionHeading
          eyebrow="Revenue risk lanes"
          title="See where follow-up should happen next"
          description="This is the Stripe-style operating layer the page was missing: not just totals, but where the team should move to protect cash right now."
        />

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {riskCards.map((card) => (
            <Link key={card.label} href={card.href} className="control-action-card">
              <div className="eyebrow">Queue</div>
              <div className="mt-2 text-lg font-semibold text-control-ink">{card.label}</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-control-ink">{card.value}</div>
              <p className="mt-3 text-sm leading-6 text-black/62">{card.note}</p>
              <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-control-ink">Open collections</div>
            </Link>
          ))}
        </div>
      </section>

      <section id="plan-economics" className="panel p-6">
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