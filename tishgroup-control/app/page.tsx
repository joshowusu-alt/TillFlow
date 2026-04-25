import Link from 'next/link';
import ControlPageHeader from '@/components/control-page-header';
import ControlGreeting from '@/components/control-greeting';
import KpiCard from '@/components/kpi-card';
import SectionHeading from '@/components/section-heading';
import { HealthPill, PlanPill, StatePill } from '@/components/status-pill';
import { requireControlStaff } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';
import { formatCedi, getPortfolioSummaryFor, getRevenueByPlanFor } from '@/lib/control-metrics';
import { getPortfolioSlaCounts } from '@/lib/sla';

export default async function PortfolioPage() {
  const staff = await requireControlStaff();
  const firstName = (staff.name ?? '').trim().split(/\s+/)[0] || staff.email.split('@')[0] || 'there';
  const roleLabel = staff.role.replace(/_/g, ' ').toLowerCase();
  const businesses = await listManagedBusinesses();
  const summary = getPortfolioSummaryFor(businesses);
  const revenueByPlan = getRevenueByPlanFor(businesses);
  const slaCounts = getPortfolioSlaCounts(businesses);
  const urgentBusinesses = businesses.filter((business) => ['GRACE', 'STARTER_FALLBACK', 'READ_ONLY'].includes(business.state)).slice(0, 5);
  const unreviewedBusinesses = businesses.filter((business) => business.needsReview).slice(0, 6);
  const workboardCards = [
    {
      title: 'Review new accounts',
      value: String(unreviewedBusinesses.length),
      href: '/businesses?filter=unreviewed',
      note: 'Confirm owner, sold plan, and assignment before the queue grows stale.',
      meta: `${unreviewedBusinesses.length} pending`,
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
  const focusOrder = [
    {
      label: 'Review new accounts',
      value: `${unreviewedBusinesses.length} pending`,
      href: '/businesses?filter=unreviewed',
    },
    {
      label: 'Run collections',
      value: `${summary.dueSoon + summary.grace + summary.fallback + summary.readOnly} accounts`,
      href: '/collections',
    },
    {
      label: 'Watch revenue risk',
      value: formatCedi(summary.expectedCollections),
      href: '/revenue',
    },
  ];

  const overdueCount = summary.grace + summary.fallback;

  return (
    <div className="space-y-4 lg:space-y-5">
      <ControlGreeting firstName={firstName} roleLabel={roleLabel} staffKey={staff.id} />
      <ControlPageHeader
        eyebrow="Portfolio command"
        title="Portfolio posture and next move."
        description="See the portfolio state, route the team into the next queue, and keep revenue risk explicit from the first viewport."
        chips={[
          { label: 'Next move', href: '#today-workboard', tone: 'dark' },
          { label: 'New accounts', href: '#new-accounts' },
          { label: 'Urgent queue', href: '#urgent-queue' },
          { label: 'Plan mix', href: '#plan-mix' },
        ]}
        stats={headerStats}
        aside={(
          <div className="space-y-4">
            <div>
              <div className="eyebrow">Next move</div>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight">Work the portfolio in queue order</h2>
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

            <div className="rounded-[18px] border border-white/10 bg-white/6 px-3.5 py-3 text-sm leading-6 text-white/74">
              Revenue at risk now: <strong>{formatCedi(summary.expectedCollections)}</strong>. Active paid base: <strong>{summary.activePaid}</strong>.
            </div>
          </div>
        )}
      />

      {/* Mobile urgency strip — tonal sprint view, hidden on desktop where the full header stats band is visible */}
      <section className="grid grid-cols-2 gap-2 md:hidden">
        <KpiCard
          tone="teal"
          label="Portfolio MRR"
          value={formatCedi(summary.mrr)}
          hint="Monthly recurring base across active paid businesses."
          accent="MRR"
        />
        <KpiCard
          tone="gold"
          label="Due soon"
          value={String(summary.dueSoon)}
          hint="Send reminders before these tip into overdue."
          accent="Reminder"
        />
        <KpiCard
          tone="ember"
          label="Overdue"
          value={String(overdueCount)}
          hint="Same-day follow-up required."
          accent={overdueCount > 0 ? (
            <span className="flex items-center gap-1">
              <span className="pulse-dot bg-[#b35c2e]" />
              Urgent
            </span>
          ) : 'Grace'}
        />
        <KpiCard
          tone="ember"
          label="Locked"
          value={String(summary.readOnly)}
          hint="Payment confirmation or commercial decision needed."
          accent={summary.readOnly > 0 ? (
            <span className="flex items-center gap-1">
              <span className="pulse-dot bg-[#b35c2e]" />
              Locked
            </span>
          ) : 'Locked'}
        />
      </section>

      <section id="today-workboard" className="panel p-4 sm:p-5">
        <SectionHeading
          eyebrow="Next move"
          title="Open the next queue"
          description="Use the portfolio posture above, then move straight into the next operating surface."
        />

        <div className="mt-4 control-action-strip">
          {workboardCards.map((card) => (
            <Link key={card.title} href={card.href} className="control-action-strip-link">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="eyebrow">Next move</div>
                  <div className="mt-1.5 text-base font-semibold tracking-tight text-control-ink">{card.title}</div>
                </div>
                <span className="rounded-full border border-black/8 bg-black/[0.03] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/50">
                  {card.meta}
                </span>
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-control-ink">{card.value}</div>
              <p className="mt-2 text-sm leading-5 text-black/58">{card.note}</p>
              <div className="mt-3 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-control-ink/70">
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
              title="Relationship posture"
              description="Quick watchlist for accounts whose relationship quality needs a closer read."
            />
            <div className="mt-4 space-y-2.5">
              {businesses.slice(0, 4).map((business) => (
                <div key={business.id} className="control-list-row control-list-row-muted">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-control-ink">{business.name}</div>
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
