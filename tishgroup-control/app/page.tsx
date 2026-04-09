import Link from 'next/link';
import ControlPageHeader from '@/components/control-page-header';
import KpiCard from '@/components/kpi-card';
import SectionHeading from '@/components/section-heading';
import { HealthPill, PlanPill, StatePill } from '@/components/status-pill';
import { requireControlStaff } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';
import { formatCedi, getPortfolioSummaryFor, getRevenueByPlanFor } from '@/lib/control-metrics';

export default async function PortfolioPage() {
  await requireControlStaff();
  const businesses = await listManagedBusinesses();
  const summary = getPortfolioSummaryFor(businesses);
  const revenueByPlan = getRevenueByPlanFor(businesses);
  const urgentBusinesses = businesses.filter((business) => ['GRACE', 'STARTER_FALLBACK', 'READ_ONLY'].includes(business.state)).slice(0, 5);
  const unreviewedBusinesses = businesses.filter((business) => business.needsReview).slice(0, 6);
  const workboardCards = [
    {
      title: 'Review new accounts',
      value: String(unreviewedBusinesses.length),
      href: '/businesses?filter=unreviewed',
      note: 'Start here when new clients need plan confirmation and assignment.',
      tone: 'border-[#1f8a82]/18 bg-[#1f8a82]/8',
    },
    {
      title: 'Run collections',
      value: String(summary.dueSoon + summary.grace + summary.fallback + summary.readOnly),
      href: '/collections',
      note: 'Work the due, overdue, fallback, and locked queues in one pass.',
      tone: 'border-[#b35c2e]/18 bg-[#b35c2e]/8',
    },
    {
      title: 'Watch revenue risk',
      value: formatCedi(summary.expectedCollections),
      href: '/revenue',
      note: 'See the cash exposed to payment delays and degraded access.',
      tone: 'border-[#e2a83d]/18 bg-[#e2a83d]/10',
    },
  ];
  const headerStats = [
    {
      label: 'Portfolio MRR',
      value: formatCedi(summary.mrr),
      hint: 'Monthly-equivalent recurring revenue across the full paid base.',
    },
    {
      label: 'Expected collections at risk',
      value: formatCedi(summary.expectedCollections),
      hint: 'Revenue exposed across due, overdue, fallback, and locked accounts.',
    },
    {
      label: 'Urgent commercial accounts',
      value: String(summary.grace + summary.fallback + summary.readOnly),
      hint: 'Businesses already in grace, degraded access, or read-only handling.',
    },
    {
      label: 'Unreviewed new accounts',
      value: String(unreviewedBusinesses.length),
      hint: 'Accounts still waiting for first commercial confirmation and assignment.',
    },
  ];
  const focusOrder = [
    {
      label: 'Clear new accounts first',
      value: `${unreviewedBusinesses.length} pending`,
      href: '/businesses?filter=unreviewed',
    },
    {
      label: 'Protect collections next',
      value: `${summary.dueSoon + summary.grace + summary.fallback + summary.readOnly} accounts`,
      href: '/collections',
    },
    {
      label: 'Check revenue concentration',
      value: formatCedi(summary.arr),
      href: '/revenue',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Mobile urgency pulse strip — 3 tap-able stat tiles, hidden on desktop */}
      <div className="grid grid-cols-3 gap-3 lg:hidden">
        <Link href="/businesses?filter=unreviewed" className="relative overflow-hidden rounded-2xl border border-[#1f8a82]/28 bg-gradient-to-br from-teal-50/80 via-white to-teal-50/40 p-4 text-center shadow-card transition duration-200 active:scale-95">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-[#1f8a82]" aria-hidden="true" />
          <div className="font-display text-3xl font-bold tabular-nums tracking-tight text-[#1a7370]">{unreviewedBusinesses.length}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#1f8a82]/70">Unreviewed</div>
        </Link>
        <Link href="/collections" className="relative overflow-hidden rounded-2xl border border-[#b35c2e]/28 bg-gradient-to-br from-orange-50/80 via-white to-orange-50/40 p-4 text-center shadow-card transition duration-200 active:scale-95">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-[#b35c2e]" aria-hidden="true" />
          <div className="flex items-center justify-center gap-1.5">
            {(summary.grace + summary.fallback) > 0 && <span className="pulse-dot bg-[#b35c2e]" />}
            <span className="font-display text-3xl font-bold tabular-nums tracking-tight text-[#9a4a22]">{summary.grace + summary.fallback}</span>
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#b35c2e]/70">Overdue</div>
        </Link>
        <Link href="/collections" className="relative overflow-hidden rounded-2xl border border-[#e2a83d]/28 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 p-4 text-center shadow-card transition duration-200 active:scale-95">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-[#e2a83d]" aria-hidden="true" />
          <div className="flex items-center justify-center gap-1.5">
            {summary.readOnly > 0 && <span className="pulse-dot bg-[#e2a83d]" />}
            <span className="font-display text-3xl font-bold tabular-nums tracking-tight text-[#b8882e]">{summary.readOnly}</span>
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#e2a83d]/80">Locked</div>
        </Link>
      </div>

      <ControlPageHeader
        eyebrow="Portfolio command"
        title="Run Tillflow like a managed software business, not a loose collection of accounts."
        description="This is the daily operating surface for the portfolio: see commercial exposure, route the team into the right queue, and keep every business tied to a clear owner and next move."
        chips={[
          { label: 'New accounts', href: '#new-accounts' },
          { label: 'Today\'s workboard', href: '#today-workboard', tone: 'dark' },
          { label: 'Urgent pressure', href: '#urgent-queue' },
          { label: 'Plan mix', href: '#plan-mix' },
        ]}
        stats={headerStats}
        aside={(
          <div className="space-y-5">
            <div>
              <div className="eyebrow">Today</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Recommended operating order</h2>
              <p className="mt-3 text-sm leading-7">
                Start with accounts that need an owner decision, then protect cash, then review where the revenue base is actually concentrating.
              </p>
            </div>

            <div className="control-priority-list">
              {focusOrder.map((item, index) => (
                <Link key={item.label} href={item.href} className="control-priority-item control-priority-item-tonal block">
                  <div className="flex items-start gap-3">
                    <span className="control-sequence-step">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{item.label}</div>
                      <div className="mt-1 text-sm text-white/68">{item.value}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4 text-sm leading-6 text-white/74">
              Total businesses: <strong>{summary.totalBusinesses}</strong>. Active paid base: <strong>{summary.activePaid}</strong>.
            </div>
          </div>
        )}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Portfolio MRR" value={formatCedi(summary.mrr)} hint="Monthly-equivalent recurring revenue across Starter, Growth, and Pro tenants." accent="Finance" tone="teal" />
        <KpiCard label="Due This Week" value={String(summary.dueSoon)} hint="Accounts that should be contacted before they cross into overdue handling." accent="Collections" tone="gold" />
        <KpiCard label="Fallback + Locked" value={String(summary.fallback + summary.readOnly)} hint="Businesses already degraded to Starter fallback or fully read-only and needing escalation." accent="Risk" tone="ember" />
        <KpiCard label="Unreviewed New Accounts" value={String(unreviewedBusinesses.length)} hint="New or untouched accounts that need their first Tishgroup commercial review." accent="Ops" tone="moss" />
      </section>

      <section id="today-workboard" className="panel p-5 sm:p-6">
        <SectionHeading
          eyebrow="Work through today"
          title="Start with the next operational move"
          description="On mobile, the panel should feel like a daily workboard. These shortcuts take the team straight into the next queue instead of making them think about where to go first."
        />

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {workboardCards.map((card) => (
            <Link key={card.title} href={card.href} className={`relative overflow-hidden rounded-[24px] border p-5 shadow-card transition duration-[220ms] ease-executive hover:-translate-y-[2px] hover:shadow-raised ${card.tone}`}>
              <div className="eyebrow">Next move</div>
              <div className="mt-2 text-lg font-bold tracking-tight text-control-ink">{card.title}</div>
              <div className="mt-3 font-display text-[1.9rem] font-bold tabular-nums tracking-tight text-control-ink">{card.value}</div>
              <p className="mt-3 text-sm leading-6 text-black/58">{card.note}</p>
              <div className="mt-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-control-ink/70">
                Open queue
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="new-accounts" className="panel p-6">
        <SectionHeading
          eyebrow="New accounts queue"
          title="Unreviewed businesses"
          description="Every newly created business should land here automatically so Tishgroup can confirm owner details, plan, and first billing expectations without blocking the business from running."
        />

        <div className="mt-5 space-y-3 md:hidden">
          {unreviewedBusinesses.length > 0 ? unreviewedBusinesses.map((business) => (
            <div key={business.id} className="mobile-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/businesses/${business.id}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">
                    {business.name}
                  </Link>
                  <div className="mt-1 text-xs text-black/55">No completed Tishgroup review yet</div>
                </div>
                <PlanPill plan={business.plan} />
              </div>
              <div className="mobile-card-grid">
                <div>
                  <div className="mobile-card-label">Owner</div>
                  <div className="mobile-card-value">{business.ownerName}</div>
                </div>
                <div>
                  <div className="mobile-card-label">Signed up</div>
                  <div className="mobile-card-value">{business.signedUpAt}</div>
                </div>
                <div className="col-span-2">
                  <div className="mobile-card-label">Next step</div>
                  <div className="mobile-card-value text-black/62">Open the account, confirm plan, and capture the first internal note.</div>
                </div>
              </div>
            </div>
          )) : (
            <div className="mobile-card text-sm text-black/58">No unreviewed accounts right now.</div>
          )}
        </div>

        <div className="mt-5 hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th>Owner</th>
                <th>Signed up</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody>
              {unreviewedBusinesses.length > 0 ? unreviewedBusinesses.map((business) => (
                <tr key={business.id}>
                  <td>
                    <Link href={`/businesses/${business.id}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">
                      {business.name}
                    </Link>
                    <div className="mt-1 text-xs text-black/55">No completed Tishgroup review yet</div>
                  </td>
                  <td><PlanPill plan={business.plan} /></td>
                  <td>
                    <div>{business.ownerName}</div>
                    <div className="mt-1 text-xs text-black/55">{business.ownerEmail}</div>
                  </td>
                  <td>{business.signedUpAt}</td>
                  <td className="text-sm text-black/64">Open the account, confirm the commercial plan, and capture the first internal note.</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="text-sm text-black/58">No unreviewed accounts right now.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="panel p-6">
          <div id="urgent-queue" />
          <SectionHeading
            eyebrow="Urgent queue"
            title="Commercial pressure points"
            description="The handful of businesses that need follow-up before revenue leaks, access locks, or churn risk deepens."
          />

          <div className="mt-5 space-y-3 md:hidden">
            {urgentBusinesses.length > 0 ? urgentBusinesses.map((business) => (
              <div key={business.id} className="mobile-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/businesses/${business.id}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">
                      {business.name}
                    </Link>
                    <div className="mt-1 text-xs text-black/55">Assigned to {business.assignedManager}</div>
                  </div>
                  <StatePill state={business.state} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <PlanPill plan={business.plan} />
                </div>
                <div className="mobile-card-grid">
                  <div>
                    <div className="mobile-card-label">Outstanding</div>
                    <div className="mobile-card-value">{formatCedi(business.outstandingAmount)}</div>
                  </div>
                  <div>
                    <div className="mobile-card-label">Owner</div>
                    <div className="mobile-card-value">{business.ownerName}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="mobile-card-label">Phone</div>
                    <div className="mobile-card-value">{business.ownerPhone}</div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="mobile-card text-sm text-black/58">No urgent businesses right now.</div>
            )}
          </div>

          <div className="mt-5 hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Plan</th>
                  <th>State</th>
                  <th>Outstanding</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {urgentBusinesses.map((business) => (
                  <tr key={business.id}>
                    <td>
                      <Link href={`/businesses/${business.id}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">
                        {business.name}
                      </Link>
                      <div className="mt-1 text-xs text-black/55">Assigned to {business.assignedManager}</div>
                    </td>
                    <td><PlanPill plan={business.plan} /></td>
                    <td><StatePill state={business.state} /></td>
                    <td className="font-semibold text-control-ink">{formatCedi(business.outstandingAmount)}</td>
                    <td>
                      <div>{business.ownerName}</div>
                      <div className="mt-1 text-xs text-black/55">{business.ownerPhone}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel p-6">
            <div id="plan-mix" />
            <SectionHeading
              eyebrow="Revenue mix"
              title="Portfolio by plan"
              description="The plan mix immediately tells Tishgroup where the commercial base is concentrated."
            />
            <div className="mt-5 space-y-4">
              {revenueByPlan.map((entry) => (
                <div key={entry.plan} className="rounded-2xl border border-black/8 bg-white/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <PlanPill plan={entry.plan} />
                    <div className="text-sm font-semibold text-control-ink">{formatCedi(entry.revenue)}</div>
                  </div>
                  <div className="mt-3 text-sm text-black/62">{entry.count} business{entry.count === 1 ? '' : 'es'} currently sold on this plan.</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-6">
            <SectionHeading
              eyebrow="Health watch"
              title="Relationship posture"
              description="Not every revenue issue is billing. Some are adoption, some are support, and some are poor fit."
            />
            <div className="mt-5 space-y-3">
              {businesses.slice(0, 4).map((business) => (
                <div key={business.id} className="flex items-center justify-between gap-3 rounded-2xl border border-black/8 bg-white/80 px-4 py-3 text-sm">
                  <div>
                    <div className="font-semibold text-control-ink">{business.name}</div>
                    <div className="mt-1 text-xs text-black/55">Last activity: {business.lastActivityAt}</div>
                  </div>
                  <HealthPill health={business.health} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}