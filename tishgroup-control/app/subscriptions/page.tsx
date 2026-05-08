import Link from 'next/link';
import ControlPageHeader from '@/components/control-page-header';
import SectionHeading from '@/components/section-heading';
import { PlanPill, StatePill } from '@/components/status-pill';
import { requireControlStaff } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';
import { formatCedi } from '@/lib/control-metrics';
import type { ManagedBusiness, ManagedState } from '@/lib/control-data';

type FilterKey =
  | 'all'
  | 'trial-active'
  | 'due-5-days'
  | 'due-tomorrow'
  | 'due-today'
  | 'overdue'
  | 'grace-period'
  | 'suspended'
  | 'active'
  | 'cancelled'
  | 'failed-reminders'
  | 'due-reminders';

type SortKey = 'nearest-due' | 'most-overdue' | 'newest-signup' | 'highest-value';

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseDate(value?: string | null) {
  if (!value || value === 'Not scheduled') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value?: string | null) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function isBillableBusiness(business: ManagedBusiness) {
  return business.state !== 'CANCELLED' && business.state !== 'INACTIVE';
}

function matchesFilter(business: ManagedBusiness, filter: FilterKey) {
  const daysToDue = daysUntil(business.nextDueAt);
  switch (filter) {
    case 'trial-active':
      return business.state === 'TRIAL_ACTIVE' || business.state === 'TRIAL_EXPIRING_SOON' || business.state === 'TRIAL';
    case 'due-5-days':
      return daysToDue != null && daysToDue >= 0 && daysToDue <= 5;
    case 'due-tomorrow':
      return daysToDue === 1;
    case 'due-today':
      return business.state === 'DUE_TODAY' || daysToDue === 0;
    case 'overdue':
      return business.state === 'OVERDUE' || (daysToDue != null && daysToDue < 0);
    case 'grace-period':
      return business.state === 'GRACE_PERIOD' || business.state === 'GRACE';
    case 'suspended':
      return business.state === 'SUSPENDED' || business.state === 'READ_ONLY';
    case 'active':
      return business.state === 'ACTIVE';
    case 'cancelled':
      return business.state === 'CANCELLED' || business.state === 'INACTIVE';
    case 'failed-reminders':
      return (business.failedReminderCount ?? 0) > 0;
    case 'due-reminders':
      return !!business.nextReminderAt;
    case 'all':
    default:
      return true;
  }
}

function sortBusinesses(items: ManagedBusiness[], sort: SortKey) {
  return [...items].sort((a, b) => {
    if (sort === 'highest-value') return b.monthlyValue - a.monthlyValue;
    if (sort === 'newest-signup') return (parseDate(b.signedUpAt)?.getTime() ?? 0) - (parseDate(a.signedUpAt)?.getTime() ?? 0);
    if (sort === 'most-overdue') return (daysUntil(a.nextDueAt) ?? 9999) - (daysUntil(b.nextDueAt) ?? 9999);
    return (parseDate(a.nextDueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (parseDate(b.nextDueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER);
  });
}

function actionFor(state: ManagedState, days: number | null) {
  if (state === 'TRIAL_ACTIVE' || state === 'TRIAL') return 'Monitor trial and prepare conversion.';
  if (state === 'TRIAL_EXPIRING_SOON') return 'Send trial conversion reminder today.';
  if (state === 'DUE_SOON') return 'Send pre-due payment reminder.';
  if (state === 'DUE_TODAY' || days === 0) return 'Confirm payment today.';
  if (state === 'OVERDUE' || state === 'GRACE_PERIOD' || state === 'GRACE') return 'Call owner and confirm payment plan.';
  if (state === 'SUSPENDED' || state === 'READ_ONLY') return 'Restricted. Escalate or restore after payment.';
  if (state === 'CANCELLED' || state === 'INACTIVE') return 'No collection action unless reactivated.';
  return 'No immediate action.';
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  await requireControlStaff();
  const resolvedSearchParams = (
    searchParams && typeof (searchParams as Promise<Record<string, string | string[] | undefined>>).then === 'function'
      ? await searchParams
      : (searchParams ?? {})
  ) as Record<string, string | string[] | undefined>;
  const filter = (readParam(resolvedSearchParams.filter) ?? 'all') as FilterKey;
  const sort = (readParam(resolvedSearchParams.sort) ?? 'nearest-due') as SortKey;
  const businesses = await listManagedBusinesses();
  const filtered = sortBusinesses(businesses.filter((business) => matchesFilter(business, filter)), sort);
  const billableBusinesses = businesses.filter(isBillableBusiness);
  const dueThisWeek = billableBusinesses.filter((business) => {
    const days = daysUntil(business.nextDueAt);
    return business.state === 'DUE_SOON' || business.state === 'DUE_TODAY' || (days != null && days >= 0 && days <= 7);
  });

  const summary = {
    active: billableBusinesses.filter((business) => business.state === 'ACTIVE').length,
    trials: billableBusinesses.filter((business) => ['TRIAL_ACTIVE', 'TRIAL_EXPIRING_SOON', 'TRIAL'].includes(business.state)).length,
    trialsEnding3: billableBusinesses.filter((business) => business.daysLeft != null && business.daysLeft >= 0 && business.daysLeft <= 3 && ['TRIAL_ACTIVE', 'TRIAL_EXPIRING_SOON', 'TRIAL'].includes(business.state)).length,
    dueToday: billableBusinesses.filter((business) => business.state === 'DUE_TODAY' || daysUntil(business.nextDueAt) === 0).length,
    overdue: billableBusinesses.filter((business) => business.state === 'OVERDUE' || (daysUntil(business.nextDueAt) ?? 0) < 0).length,
    suspended: billableBusinesses.filter((business) => ['SUSPENDED', 'READ_ONLY'].includes(business.state)).length,
    mrr: billableBusinesses.filter((business) => business.state === 'ACTIVE').reduce((sum, business) => sum + business.monthlyValue, 0),
    weekCollections: dueThisWeek.reduce((sum, business) => sum + (business.outstandingAmount || business.monthlyValue), 0),
  };

  const filterOptions: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'trial-active', label: 'Trial active' },
    { key: 'due-5-days', label: 'Due in 5 days' },
    { key: 'due-tomorrow', label: 'Due tomorrow' },
    { key: 'due-today', label: 'Due today' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'grace-period', label: 'Grace period' },
    { key: 'suspended', label: 'Suspended' },
    { key: 'active', label: 'Active' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'failed-reminders', label: 'Failed reminders' },
    { key: 'due-reminders', label: 'Due reminders' },
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      <ControlPageHeader
        eyebrow="Subscription monitoring"
        title="Merchant billing command centre."
        description="Track every TillFlow account by trial, due date, payment risk, and restriction status."
        chips={[{ label: 'Filters', href: '#filters', tone: 'dark' }, { label: 'Roster', href: '#subscription-roster' }]}
        stats={[
          { label: 'Active merchants', value: String(summary.active), hint: 'Paid accounts in good standing.' },
          { label: 'Trials running', value: String(summary.trials), hint: 'Businesses still inside the trial window.' },
          { label: 'Due today', value: String(summary.dueToday), hint: 'Accounts requiring same-day collection follow-up.' },
          { label: 'MRR estimate', value: formatCedi(summary.mrr), hint: 'Current active monthly recurring value.' },
        ]}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Trials ending in 3 days', summary.trialsEnding3],
          ['Overdue', summary.overdue],
          ['Suspended', summary.suspended],
          ['Expected collections this week', formatCedi(summary.weekCollections)],
        ].map(([label, value]) => (
          <div key={String(label)} className="panel p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/42">{label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-control-ink">{value}</div>
          </div>
        ))}
      </section>

      <section id="filters" className="control-toolbar">
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((option) => (
            <Link
              key={option.key}
              href={`/subscriptions?filter=${option.key}&sort=${sort}`}
              className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${filter === option.key ? 'bg-[#122126] text-white' : 'border border-black/10 bg-white text-black/64'}`}
            >
              {option.label}
            </Link>
          ))}
        </div>
        <form action="/subscriptions" className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="filter" value={filter} />
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-control-ink">Sort</span>
            <select name="sort" defaultValue={sort} className="control-field min-w-[220px]">
              <option value="nearest-due">Nearest due date first</option>
              <option value="most-overdue">Most overdue first</option>
              <option value="newest-signup">Newest signup</option>
              <option value="highest-value">Highest plan/value</option>
            </select>
          </label>
          <button className="inline-flex h-[42px] items-center justify-center rounded-[18px] bg-[#122126] px-4 text-sm font-semibold text-white">Apply sort</button>
        </form>
      </section>

      <section id="subscription-roster" className="panel overflow-hidden p-0">
        <div className="space-y-3 p-4 md:hidden">
          {filtered.map((business) => {
            const days = daysUntil(business.nextDueAt);
            return (
              <div key={business.id} className="mobile-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/businesses/${business.id}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">{business.name}</Link>
                    <div className="mt-1 text-xs text-black/55">{business.ownerName} · {business.ownerPhone}</div>
                  </div>
                  <StatePill state={business.state} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2"><PlanPill plan={business.plan} />{business.daysLeft != null ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">{business.daysLeft} days left</span> : null}</div>
                <div className="mobile-card-grid">
                  <div><div className="mobile-card-label">Trial end</div><div className="mobile-card-value">{business.trialEndAt ?? 'Not active'}</div></div>
                  <div><div className="mobile-card-label">Next billing</div><div className="mobile-card-value">{business.nextDueAt}</div></div>
                  <div><div className="mobile-card-label">Amount</div><div className="mobile-card-value">{formatCedi(business.monthlyValue)}</div></div>
                  <div><div className="mobile-card-label">Last paid</div><div className="mobile-card-value">{business.lastPaymentAt ?? 'Not yet'}</div></div>
                  <div><div className="mobile-card-label">SMS</div><div className="mobile-card-value">{business.lastReminderStatus ?? 'None'}</div></div>
                </div>
                <div className="mt-3 text-sm text-black/62">{actionFor(business.state, days)}</div>
              </div>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Owner/contact</th>
                <th>Plan</th>
                <th>Trial</th>
                <th>Status</th>
                <th>Next billing</th>
                <th>Amount due</th>
                <th>Last payment</th>
                <th>SMS reminders</th>
                <th>Internal action needed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((business) => {
                const days = daysUntil(business.nextDueAt);
                return (
                  <tr key={business.id}>
                    <td><Link href={`/businesses/${business.id}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">{business.name}</Link><div className="mt-1 text-xs text-black/55">Signed up {business.signedUpAt}</div></td>
                    <td><div>{business.ownerName}</div><div className="mt-1 text-xs text-black/55">{business.ownerPhone} · {business.ownerEmail}</div></td>
                    <td><PlanPill plan={business.plan} /></td>
                    <td><div className="text-sm text-black/66">{business.trialStartAt ?? 'Not active'} - {business.trialEndAt ?? 'Not active'}</div>{business.daysLeft != null ? <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">{business.daysLeft} days left</div> : null}</td>
                    <td><StatePill state={business.state} /></td>
                    <td>{business.nextDueAt}</td>
                    <td className="font-semibold text-control-ink">{formatCedi(business.monthlyValue)}</td>
                    <td>{business.lastPaymentAt ?? 'Not yet'}</td>
                    <td>
                      <div className="text-sm text-black/66">Last: {business.lastReminderAt ?? 'None'}{business.lastReminderStatus ? ` (${business.lastReminderStatus})` : ''}</div>
                      <div className="mt-1 text-xs text-black/50">Next: {business.nextReminderAt ?? 'None queued'}</div>
                      {(business.failedReminderCount ?? 0) > 0 ? <div className="mt-1 text-xs font-semibold text-rose-700">{business.failedReminderCount} failed</div> : null}
                    </td>
                    <td className="text-sm text-black/66">{actionFor(business.state, days)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? <tr><td colSpan={10} className="text-sm text-black/58">No businesses match this subscription view.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
