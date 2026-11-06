import Link from 'next/link';
import ControlPageHeader from '@/components/control-page-header';
import ControlGreeting from '@/components/control-greeting';
import SectionHeading from '@/components/section-heading';
import { HealthPill, PlanPill, StatePill } from '@/components/status-pill';
import { requireControlStaff } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';
import { formatCedi, getCollectionQueuesFor, getPortfolioSummaryFor, getRevenueByPlanFor } from '@/lib/control-metrics';
import { getPortfolioSlaCounts } from '@/lib/sla';
import { getCollectionsRhythm } from '@/lib/collections-trend';
import Sparkline from '@/components/sparkline';

export default async function PortfolioPage() {
  const staff = await requireControlStaff();
  const firstName = (staff.name ?? '').trim().split(/\s+/)[0] || staff.email.split('@')[0] || 'there';
  const roleLabel = staff.role.replace(/_/g, ' ').toLowerCase();
  const businesses = await listManagedBusinesses();
  const summary = getPortfolioSummaryFor(businesses);
  const revenueByPlan = getRevenueByPlanFor(businesses);
  const slaCounts = getPortfolioSlaCounts(businesses);
  const rhythm = await getCollectionsRhythm();
  const queues = getCollectionQueuesFor(businesses);
  const urgentBusinesses = [...queues.locked, ...queues.overdue].slice(0, 5);
  const unreviewedCount = businesses.filter((business) => business.needsReview).length;
  const unreviewedBusinesses = businesses.filter((business) => business.needsReview).slice(0, 6);
  const workboardCards = [
    {
      title: 'Review new accounts',
      value: String(unreviewedCount),
      href: '/businesses?filter=unreviewed',
      note: 'Confirm owner, sold plan, and assignment before the queue grows stale.',
      meta: `${unreviewedCount} pending`,
    },
    {
      title: 'Run collections',
      value: String(summary.dueSoon + summary.grace + summary.fallback + summary.readOnly),
      href: '/collections',
      note: 'Work due-soon, overdue, fallback, and locked accounts in operating order.',
      meta: 'Queue board',
    },
    {
      title: 'Watch revenue risk',
      value: formatCedi(summary.expectedCollections),
      href: '/revenue',
      note: 'See cash already exposed to payment delay, fallback, or restriction.',
      meta: 'Receivables',
    },
  ];
  const headerStats = [
    {
      label: 'Portfolio MRR',
      value: formatCedi(summary.mrr),
      hint: 'Monthly recurring base across active paid businesses.',
    },
    {
      label: 'Due this week',
      value: String(summary.dueSoon),
      hint: 'Accounts that need reminder before they tip into overdue handling.',
    },
    {
      label: 'Locked / read-only',
      value: String(summary.readOnly),
      hint: 'Accounts already restricted and waiting on payment confirmation or decision.',
    },
    {
      label: 'SLA breaches',
      value: slaCounts.total === 0 ? '0' : `${slaCounts.red}R · ${slaCounts.amber}A`,
      hint: 'Accounts ageing on the team\'s own queue (unreviewed or no contact).',
    },
  ];
  return (
    <div className="space-y-4 lg:space-y-5">
      <ControlGreeting firstName={firstName} roleLabel={roleLabel} staffKey={staff.id} />
      <ControlPageHeader
        eyebrow="Tish Group Control"
        title="Business overview"
        description="Find accounts that need attention, follow up on payments and open a business to investigate."
        stats={headerStats}
      />

      <section id="today-workboard" className="panel p-4 sm:p-5">
        <SectionHeading
          eyebrow="Your work today"
          title="Needs attention"
          description="Choose a queue to review accounts or follow up on payments."
        />

        <div className="mt-4 control-action-strip">
          {workboardCards.map((card) => (
            <Link key={card.title} href={card.href} className="control-action-strip-link control-overview-action">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="eyebrow hidden md:block">Action needed</div>
                  <div className="mt-1.5 text-base font-semibold tracking-tight text-control-ink">{card.title}</div>
                </div>
                <span className="hidden rounded-full border border-black/8 bg-black/[0.03] px-2 py-1 text-[10px] md:inline-flex font-semibold uppercase tracking-[0.16em] text-black/50">
                  {card.meta}
                </span>
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-control-ink">{card.value}</div>
              <p className="mt-2 hidden text-sm leading-5 text-black/58 md:block">{card.note}</p>
              <div className="mt-3 hidden items-center gap-2 text-[11px] md:inline-flex font-bold uppercase tracking-[0.18em] text-control-ink/70">
                Open
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-4">
          <section id="new-accounts" className="panel p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionHeading
                eyebrow="New accounts queue"
                title="Unreviewed businesses"
                description="Confirm owner, sold plan, and first billing expectations without leaving new accounts sitting in limbo."
              />
              <Link
                href="/businesses?filter=unreviewed"
                className="inline-flex items-center rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-control-ink transition hover:bg-black/[0.03]"
              >
                Open queue
              </Link>
            </div>

            <div className="mt-4 space-y-3 md:hidden">
              {unreviewedBusinesses.length > 0 ? unreviewedBusinesses.map((business) => (
                <div key={business.id} className="mobile-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/businesses/${business.id}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">
                        {business.name}
                      </Link>
                      <div className="mt-1 text-xs text-black/55">{business.ownerName} · {business.signedUpAt}</div>
                    </div>
                    <PlanPill plan={business.plan} />
                  </div>
                  <div className="mt-3 rounded-[18px] border border-black/8 bg-black/[0.02] px-3 py-2.5 text-sm text-black/62">
                    Open the account, confirm the sold plan, and capture the first internal note.
                  </div>
                </div>
              )) : (
                <div className="control-inline-note">No unreviewed accounts right now.</div>
              )}
            </div>

            <div className="mt-4 hidden overflow-x-auto md:block">
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
                        <div className="mt-1 text-xs text-black/55">Pending first commercial review</div>
                      </td>
                      <td><PlanPill plan={business.plan} /></td>
                      <td>
                        <div>{business.ownerName}</div>
                        <div className="mt-1 text-xs text-black/55">{business.ownerEmail}</div>
                      </td>
                      <td>{business.signedUpAt}</td>
                      <td className="text-sm text-black/64">Confirm plan, assignment, and first billing note.</td>
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

          <div className="panel p-4 sm:p-5">
            <div id="urgent-queue" />
            <SectionHeading
              eyebrow="Urgent queue"
              title="Revenue pressure"
              description="The businesses that need same-day follow-up before cash leakage or access restrictions deepen."
            />

            <div className="mt-4 space-y-3">
              {urgentBusinesses.length > 0 ? urgentBusinesses.map((business) => (
                <div key={business.id} className="control-list-row">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/businesses/${business.id}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">
                        {business.name}
                      </Link>
                      <div className="mt-1 text-xs text-black/55">{business.ownerName} · {business.assignedManager}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <PlanPill plan={business.plan} />
                      <StatePill state={business.state} />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-black/62">
                    <span>Outstanding <strong className="text-control-ink">{formatCedi(business.outstandingAmount)}</strong></span>
                    <span>Due <strong className="text-control-ink">{business.nextDueAt}</strong></span>
                    <span>Phone <strong className="text-control-ink">{business.ownerPhone}</strong></span>
                  </div>
                </div>
              )) : (
                <div className="control-inline-note">No urgent businesses right now.</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <section className="panel flex items-center justify-between gap-4 p-4 sm:p-5" aria-label="Collections over the last 14 days">
            <div>
              <div className="eyebrow">Collected · last 14 days</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{formatCedi(Math.round(rhythm.totalPence / 100))}</div>
              <p className="mt-1 text-sm text-black/60">Today: {formatCedi(Math.round(rhythm.todayPence / 100))}</p>
            </div>
            <Sparkline values={rhythm.daily} tone="teal" width={100} height={40} ariaLabel="Daily collections trend" />
          </section>
          <div className="panel p-4 sm:p-5">
            <div id="plan-mix" />
            <SectionHeading
              eyebrow="Revenue mix"
              title="Portfolio by sold plan"
              description="Read where the recurring base is concentrated before you choose expansion or risk work."
            />
            <div className="mt-4 space-y-2.5">
              {revenueByPlan.map((entry) => (
                <div key={entry.plan} className="control-list-row control-list-row-muted">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <PlanPill plan={entry.plan} />
                      <span className="text-sm text-black/62">{entry.count} business{entry.count === 1 ? '' : 'es'}</span>
                    </div>
                    <div className="text-sm font-semibold text-control-ink">{formatCedi(entry.revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-4 sm:p-5">
            <SectionHeading
              eyebrow="Health watch"
              title="Account health"
              description="Quick watchlist for accounts whose relationship quality needs a closer read."
            />
            <div className="mt-4 space-y-2.5">
              {businesses.slice(0, 4).map((business) => (
                <div key={business.id} className="control-list-row control-list-row-muted">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Link href={`/businesses/${business.id}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">{business.name}</Link>
                      <div className="mt-1 text-xs text-black/55">Last activity {business.lastActivityAt}</div>
                    </div>
                    <HealthPill health={business.health} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
