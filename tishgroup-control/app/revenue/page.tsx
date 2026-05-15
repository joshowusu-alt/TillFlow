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
    { key: 'current', ...buckets.current, tone: 'border-control-teal/18 bg-control-teal/6' },
    { key: 'approaching', ...buckets.approaching, tone: 'border-control-gold/20 bg-control-gold/8' },
    { key: 'overdue', ...buckets.overdue, tone: 'border-control-ember/20 bg-control-ember/8' },
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
      hint: 'Current and active.',
    },
    {
      label: 'Due now',
      value: formatCedi(buckets.approaching.amount),
      hint: 'Cash in the reminder window.',
    },
    {
      label: 'Overdue exposure',
      value: formatCedi(buckets.overdue.amount),
      hint: 'Outstanding across grace and fallback accounts.',
    },
    {
      label: 'Locked exposure',
      value: formatCedi(buckets.locked.amount),
      hint: 'Cash tied to restricted accounts.',
    },
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      <ControlPageHeader
        eyebrow="Receivables"
        title="Revenue posture and cash exposure."
        description="See where the money sits, where the risk is building, and which protection step the team should run next."
        chips={[
          { label: 'Revenue posture', href: '#aging-buckets' },
          { label: 'Protection sequence', href: '#protection-sequence', tone: 'dark' },
          { label: 'Plan economics', href: '#plan-economics' },
        ]}
        stats={headerStats}
        aside={(
          <div className="space-y-4">
            <div>
              <div className="eyebrow">Protection order</div>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight">Move exposure before it compounds</h2>
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

      <MrrStackedBar buckets={buckets} />

      <section id="aging-buckets" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {agingCards.map((card) => (
          <Link key={card.key} href={card.href} className={`rounded-[20px] border px-4 py-3 transition hover:-translate-y-[1px] hover:shadow-md ${card.tone}`}>
            <div className="eyebrow">{card.label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-control-ink">{card.amount > 0 ? formatCedi(card.amount) : card.count}</div>
            <div className="mt-1 text-sm font-medium text-black/52">{card.count} account{card.count === 1 ? '' : 's'}</div>
            <p className="mt-2 text-sm leading-5 text-black/62">{card.description}</p>
          </Link>
        ))}
      </section>

      <section id="protection-sequence" className="panel p-4 sm:p-5">
        <SectionHeading
          eyebrow="Protection sequence"
          title="Protection order"
          description="Use receivables posture to decide what queue to run first, what needs same-day recovery, and where restriction should stay in place."
        />

        <div className="control-sequence-grid mt-4 md:grid-cols-3">
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

      <section id="plan-economics" className="panel p-4 sm:p-5">
        <SectionHeading
          eyebrow="Plan economics"
          title="Revenue by sold plan"
          description="Read the commercial mix quickly: where the base sits now and where lower-value dependence is still concentrated."
        />
        <div className="mt-4 space-y-2.5">
          {revenueByPlan.map((entry) => (
            <div key={entry.plan} className="control-list-row control-list-row-muted">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <PlanLabel plan={entry.plan} />
                  <span className="text-sm text-black/62">{entry.count} business{entry.count === 1 ? '' : 'es'}</span>
                </div>
                <div className="text-sm font-semibold text-control-ink">{formatCedi(entry.revenue)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlanLabel({ plan }: { plan: string }) {
  return (
    <span className="inline-flex rounded-full border border-black/8 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-control-ink">
      {plan}
    </span>
  );
}

type AgingBuckets = ReturnType<typeof import('@/lib/control-metrics').getAgingBucketsFor>;

function MrrStackedBar({ buckets }: { buckets: AgingBuckets }) {
  const segments = [
    { key: 'current', label: 'Healthy', amount: buckets.current.amount, count: buckets.current.count, color: 'var(--teal)', href: '/collections#healthy' },
    { key: 'approaching', label: 'Due now', amount: buckets.approaching.amount, count: buckets.approaching.count, color: 'var(--gold)', href: '/collections#dueSoon' },
    { key: 'overdue', label: 'Overdue', amount: buckets.overdue.amount, count: buckets.overdue.count, color: 'var(--ember)', href: '/collections#overdue' },
    { key: 'locked', label: 'Locked', amount: buckets.locked.amount, count: buckets.locked.count, color: 'var(--ink)', href: '/collections#locked' },
  ];
  const total = segments.reduce((sum, s) => sum + s.amount, 0);

  if (total === 0) return null;

  let xOffset = 0;
  const barSegments = segments.map((seg) => {
    const pct = (seg.amount / total) * 100;
    const x = xOffset;
    xOffset += pct;
    return { ...seg, pct, x };
  });

  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow">MRR exposure by health bucket</div>
        <div className="text-sm font-semibold text-control-ink">{formatCedi(total)} total</div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl" role="img" aria-label="MRR distribution across portfolio health buckets">
        <svg viewBox="0 0 100 12" preserveAspectRatio="none" className="h-8 w-full" xmlns="http://www.w3.org/2000/svg">
          {barSegments.map((seg) =>
            seg.pct > 0 ? (
              <rect
                key={seg.key}
                x={seg.x}
                y={0}
                width={seg.pct}
                height={12}
                fill={seg.color}
              />
            ) : null
          )}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {barSegments.map((seg) => (
          <Link key={seg.key} href={seg.href} className="flex items-center gap-2 text-sm text-black/62 transition hover:text-control-ink">
            <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: seg.color }} />
            <span className="font-medium text-control-ink">{seg.label}</span>
            <span>{formatCedi(seg.amount)}</span>
            <span className="text-black/40">({seg.pct.toFixed(0)}%)</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
