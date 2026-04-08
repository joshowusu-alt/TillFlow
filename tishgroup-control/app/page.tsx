import Link from 'next/link';
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

  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden p-5 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-end">
          <div className="space-y-4">
            <div className="eyebrow">Tishgroup portfolio control</div>
            <h1 className="page-title font-[var(--font-display)] text-control-ink">Run Tillflow like a managed software business, not a loose collection of accounts.</h1>
            <p className="max-w-3xl text-base leading-8 text-black/64">
              One place to see plan mix, MRR, due accounts, fallback risk, support watchlists, and the exact next action for every customer business.
            </p>
          </div>

          <div className="rounded-panel border border-black/10 bg-white/80 p-5">
            <div className="eyebrow">Current position</div>
            <div className="mt-4 space-y-3 text-sm text-black/65">
              <div className="flex items-center justify-between">
                <span>Total businesses</span>
                <strong className="text-base text-control-ink">{summary.totalBusinesses}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Monthly recurring revenue</span>
                <strong className="text-base text-control-ink">{formatCedi(summary.mrr)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Expected collections at risk</span>
                <strong className="text-base text-control-ink">{formatCedi(summary.expectedCollections)}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Portfolio MRR" value={formatCedi(summary.mrr)} hint="Monthly-equivalent recurring revenue across Starter, Growth, and Pro tenants." accent="Finance" />
        <KpiCard label="Due This Week" value={String(summary.dueSoon)} hint="Accounts that should be contacted before they cross into overdue handling." accent="Collections" />
        <KpiCard label="Fallback + Locked" value={String(summary.fallback + summary.readOnly)} hint="Businesses already degraded to Starter fallback or fully read-only and needing escalation." accent="Risk" />
        <KpiCard label="Unreviewed New Accounts" value={String(unreviewedBusinesses.length)} hint="New or untouched accounts that need their first Tishgroup commercial review." accent="Ops" />
      </section>

      <section className="panel p-6">
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