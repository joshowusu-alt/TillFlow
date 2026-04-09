import Link from 'next/link';
import ControlPageHeader from '@/components/control-page-header';
import SectionHeading from '@/components/section-heading';
import { requireControlStaff } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';
import { formatCedi, getAgingBucketsFor, getPortfolioSummaryFor, getRevenueByPlanFor } from '@/lib/control-metrics';

export const dynamic = 'force-dynamic';

export default async function RevenuePage() {
  await requireControlStaff();
  const businesses = await listManagedBusinesses();
  const summary = getPortfolioSummaryFor(businesses);
  const revenueByPlan = getRevenueByPlanFor(businesses);
  const buckets = getAgingBucketsFor(businesses);
  const agingCards = [
    { key: 'current', ...buckets.current, tone: 'border-[#1f8a82]/18 bg-[#1f8a82]/6' },
    { key: 'approaching', ...buckets.approaching, tone: 'border-[#e2a83d]/20 bg-[#e2a83d]/8' },
    { key: 'overdue', ...buckets.overdue, tone: 'border-[#b35c2e]/20 bg-[#b35c2e]/8' },
    { key: 'locked', ...buckets.locked, tone: 'border-black/10 bg-black/[0.03]' },
  ];
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
      label: 'Healthy accounts',
      value: String(buckets.current.count),
      hint: 'Accounts active and current — no immediate billing action needed.',
    },
    {
      label: 'Due now',
      value: formatCedi(buckets.approaching.amount),
      hint: 'Cash in the billing window — reminders before these tip into overdue.',
    },
    {
      label: 'Overdue exposure',
      value: formatCedi(buckets.overdue.amount),
      hint: 'Outstanding across grace and fallback accounts needing same-day follow-up.',
    },
    {
      label: 'Locked exposure',
      value: formatCedi(buckets.locked.amount),
      hint: 'Cash tied to accounts with access restrictions. Needs payment or decision.',
    },
  ];

  return (
    <div className="space-y-6">
      <ControlPageHeader
        eyebrow="Receivables"
        title="Track cash position, not just status."
        description="Four aging buckets show exactly where money sits: healthy, approaching, overdue, and locked. Use this to route the team into the right collections lane before cash slips further."
        chips={[
          { label: 'Aging buckets', href: '#aging-buckets' },
          { label: 'Protection sequence', href: '#protection-sequence', tone: 'dark' },
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

      <section id="aging-buckets" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {agingCards.map((card) => (
          <Link key={card.key} href={card.href} className={`rounded-[24px] border p-5 transition hover:-translate-y-[1px] hover:shadow-md ${card.tone}`}>
            <div className="eyebrow">{card.label}</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-control-ink">{card.amount > 0 ? formatCedi(card.amount) : card.count}</div>
            <div className="mt-1 text-sm font-medium text-black/52">{card.count} account{card.count === 1 ? '' : 's'}</div>
            <p className="mt-3 text-sm leading-6 text-black/62">{card.description}</p>
          </Link>
        ))}
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