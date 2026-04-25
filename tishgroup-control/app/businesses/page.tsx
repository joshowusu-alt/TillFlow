import Link from 'next/link';
import { bulkReviewControlBusinessesAction, updateControlSubscriptionAction } from '@/app/actions/control-businesses';
import BillingScheduleFields from '@/components/BillingScheduleFields';
import ControlPageHeader from '@/components/control-page-header';
import SectionHeading from '@/components/section-heading';
import { PlanPill, StatePill } from '@/components/status-pill';
import SlaFlags from '@/components/sla-flags';
import BulkRosterClient from '@/components/bulk-roster-client';
import { listActiveControlStaff, requireControlStaff } from '@/lib/control-auth';
import { listManagedBusinessesPage } from '@/lib/control-service';
import { formatCedi } from '@/lib/control-metrics';
import { getSlaFlags } from '@/lib/sla';

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readPositiveInt(value: string | string[] | undefined, fallback: number) {
  const rawValue = readSearchParam(value);
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function readPageSize(value: string | string[] | undefined) {
  const size = readPositiveInt(value, 50);
  if (size <= 25) return 25;
  if (size <= 50) return 50;
  return 100;
}

function buildBusinessesHref({
  filter,
  search,
  page,
  pageSize,
}: {
  filter: 'all' | 'unreviewed';
  search: string;
  page?: number;
  pageSize: number;
}) {
  const params = new URLSearchParams();

  if (filter === 'unreviewed') {
    params.set('filter', 'unreviewed');
  }

  if (search) {
    params.set('search', search);
  }

  if (page && page > 1) {
    params.set('page', String(page));
  }

  if (pageSize !== 50) {
    params.set('pageSize', String(pageSize));
  }

  const query = params.toString();
  return query ? `/businesses?${query}` : '/businesses';
}

export default async function BusinessesPage({
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
  const filter = readSearchParam(resolvedSearchParams.filter) === 'unreviewed' ? 'unreviewed' : 'all';
  const search = readSearchParam(resolvedSearchParams.search)?.trim() ?? '';
  const page = readPositiveInt(resolvedSearchParams.page, 1);
  const pageSize = readPageSize(resolvedSearchParams.pageSize);
  const error = readSearchParam(resolvedSearchParams.error);
  const updated = readSearchParam(resolvedSearchParams.updated);
  const [roster, staffOptions] = await Promise.all([
    listManagedBusinessesPage({ filter, search, page, pageSize }),
    listActiveControlStaff(),
  ]);
  const pageBusinesses = roster.items;
  const listSummary = roster.total === 0
    ? 'No businesses match this view.'
    : `Showing ${roster.startIndex}-${roster.endIndex} of ${roster.total} matching businesses.`;
  const hasPreviousPage = roster.page > 1;
  const hasNextPage = roster.page < roster.totalPages;
  const clearSearchHref = buildBusinessesHref({ filter, search: '', pageSize: roster.pageSize });
  const atRiskOnPage = pageBusinesses.filter((business) => ['GRACE', 'STARTER_FALLBACK', 'READ_ONLY'].includes(business.state)).length;
  const headerStats = [
    {
      label: 'In this view',
      value: String(roster.total),
      hint: 'Businesses matching the current filter and search.',
    },
    {
      label: 'Unreviewed',
      value: String(roster.unreviewedCount),
      hint: 'Accounts still waiting for first commercial review.',
    },
    {
      label: 'At risk on page',
      value: String(atRiskOnPage),
      hint: 'Current page items already in grace, fallback, or read-only.',
    },
    {
      label: 'Page size',
      value: String(roster.pageSize),
      hint: 'Scoped views keep the roster fast on large portfolios.',
    },
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">{error}</div>
      ) : null}

      {updated === 'bulk-review' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Bulk review applied. The selected businesses have been assigned, marked reviewed, and updated with any sold-plan change you saved.
        </div>
      ) : null}

      {updated === 'subscription' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Billing setup saved. The selected business now has an updated plan, start date, and billing cadence in TG Control, and Tillflow will reflect that on its Billing page.
        </div>
      ) : null}

      {updated === 'reopened' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          A business was returned to the review queue and will now appear again in the unreviewed list.
        </div>
      ) : null}

      <ControlPageHeader
        eyebrow="Managed businesses"
        title="Commercial roster and billing control."
        description="Keep the roster fast, make billing edits without scroll fatigue, and keep every business tied to a clear owner, plan, and next action."
        chips={[
          { label: 'Roster control', href: '#roster-tools' },
          { label: 'Quick billing setup', href: '#billing-setup', tone: 'dark' },
          ...(filter === 'unreviewed' && pageBusinesses.length > 0 ? [{ label: 'Bulk review', href: '#bulk-review' }] : []),
          { label: 'Roster', href: '#business-roster' },
        ]}
        stats={headerStats}
        aside={(
          <div className="space-y-4">
            <div>
              <div className="eyebrow">Roster discipline</div>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight">Operate the current slice only</h2>
            </div>
            <div className="rounded-[18px] border border-white/10 bg-white/6 px-3.5 py-3 text-sm leading-6 text-white/74">
              {listSummary} Current filter: <strong>{filter === 'unreviewed' ? 'Unreviewed only' : 'All businesses'}</strong>.
            </div>
          </div>
        )}
      />

      <section className="control-toolbar">
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href={buildBusinessesHref({ filter: 'all', search, pageSize: roster.pageSize })}
            className={`inline-flex rounded-full px-3 py-1.5 font-semibold ${filter === 'all' ? 'bg-[#122126] text-white' : 'border border-black/10 bg-white text-black/64'}`}
          >
            All businesses ({roster.totalBusinesses})
          </Link>
          <Link
            href={buildBusinessesHref({ filter: 'unreviewed', search, pageSize: roster.pageSize })}
            className={`inline-flex rounded-full px-3 py-1.5 font-semibold ${filter === 'unreviewed' ? 'bg-[#1f8a82] text-white' : 'border border-black/10 bg-white text-black/64'}`}
          >
            Unreviewed only ({roster.unreviewedCount})
          </Link>
        </div>

        <form id="roster-tools" action="/businesses" className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_auto_auto] lg:items-end">
          {filter === 'unreviewed' ? <input type="hidden" name="filter" value="unreviewed" /> : null}

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-control-ink">Find a business</span>
            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder="Search business, owner, phone, email, or manager"
              className="control-field"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-control-ink">Rows per page</span>
            <select name="pageSize" defaultValue={String(roster.pageSize)} className="control-field">
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>

          <button type="submit" className="inline-flex h-[42px] items-center justify-center rounded-[18px] bg-[#122126] px-4 text-sm font-semibold text-white transition hover:bg-[#0d1a1e]">
            Apply view
          </button>

          <Link href={clearSearchHref} className="inline-flex h-[42px] items-center justify-center rounded-[18px] border border-black/10 bg-white px-4 text-sm font-semibold text-control-ink transition hover:bg-black/[0.03]">
            Clear
          </Link>
        </form>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-black/62">
          <span>{listSummary}</span>
          <span>Page {roster.page} of {roster.totalPages}</span>
        </div>
      </section>

      <section id="billing-setup" className="panel p-4 sm:p-5">
        <SectionHeading
          eyebrow="Billing setup"
          title="Quick billing setup"
          description="Select a business on the current page, adjust the commercial plan, and save billing dates without opening the full record."
        />

        {pageBusinesses.length > 0 ? (
          <form action={updateControlSubscriptionAction} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="returnPath" value={buildBusinessesHref({ filter, search, page: roster.page, pageSize: roster.pageSize })} />

            <label className="block space-y-1 text-sm sm:col-span-2">
              <span className="font-medium text-control-ink">Business</span>
              <select name="businessId" defaultValue={pageBusinesses[0]?.id ?? ''} className="control-field" required>
                {pageBusinesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name} · {business.plan} · {business.billingCadence}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-control-ink">Sold plan</span>
              <select name="purchasedPlan" defaultValue="STARTER" className="control-field">
                <option value="STARTER">Starter</option>
                <option value="GROWTH">Growth</option>
                <option value="PRO">Pro</option>
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-control-ink">Subscription status</span>
              <select name="status" defaultValue="ACTIVE" className="control-field">
                <option value="ACTIVE">Active</option>
                <option value="TRIAL">Trial</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="READ_ONLY">Read only</option>
                <option value="INACTIVE">Deactivated</option>
              </select>
            </label>

            <BillingScheduleFields />

            <p className="text-sm text-black/60 sm:col-span-2">
              Leave the first due date blank to let TG Control calculate it from the start date and whether the business is monthly or annual.
            </p>

            <button type="submit" className="inline-flex h-[42px] items-center justify-center rounded-[18px] bg-[#122126] px-4 text-sm font-semibold text-white transition hover:bg-[#0d1a1e] sm:col-span-2 sm:w-fit">
              Save billing setup
            </button>
          </form>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-black/12 bg-white/70 px-4 py-4 text-sm text-black/60">
            Narrow the roster with search or switch pages before saving billing setup. There are no businesses in the current view yet.
          </div>
        )}
      </section>

      <BulkRosterClient
        rosterId="businesses"
        totalOnPage={pageBusinesses.length}
        bulkActions={(selectedIds) => (
          <form action={bulkReviewControlBusinessesAction} className="space-y-2.5">
            <input type="hidden" name="returnPath" value={buildBusinessesHref({ filter, search, page: roster.page, pageSize: roster.pageSize })} />
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="selectedId" value={id} />
            ))}
            <div className="grid gap-2 sm:grid-cols-2">
              <select name="assignedManagerId" defaultValue="SELF" className="h-10 w-full rounded-[14px] border border-white/15 bg-white/8 px-3 text-sm font-medium text-white">
                <option value="SELF">Assign to me</option>
                <option value="UNASSIGNED">Leave unassigned</option>
                {staffOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name} · {option.role.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <select name="purchasedPlan" defaultValue="KEEP_CURRENT" className="h-10 w-full rounded-[14px] border border-white/15 bg-white/8 px-3 text-sm font-medium text-white">
                <option value="KEEP_CURRENT">Keep sold plan</option>
                <option value="STARTER">Starter</option>
                <option value="GROWTH">Growth</option>
                <option value="PRO">Pro</option>
              </select>
            </div>
            <input
              type="text"
              name="reviewNote"
              placeholder="Optional review note"
              className="h-10 w-full rounded-[14px] border border-white/15 bg-white/8 px-3 text-sm font-medium text-white placeholder:text-white/45"
            />
            <button
              type="submit"
              className="inline-flex h-10 w-full items-center justify-center rounded-[14px] bg-white px-3 text-sm font-bold text-control-ink transition hover:bg-white/90"
            >
              Review {selectedIds.length} selected
            </button>
          </form>
        )}
      >

      <section id="business-roster" className="panel overflow-hidden p-0">
        <div className="space-y-3 p-4 md:hidden">
          {pageBusinesses.length > 0 ? pageBusinesses.map((business) => {
            const slaFlags = getSlaFlags(business);
            return (
            <div key={business.id} className="mobile-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <input
                    type="checkbox"
                    name="selectedId"
                    value={business.id}
                    data-roster-id="businesses"
                    aria-label={`Select ${business.name}`}
                    className="mt-1 h-4 w-4 flex-shrink-0 rounded border-black/20 accent-[#122126]"
                  />
                  <div className="min-w-0">
                    <Link href={`/businesses/${business.id}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">
                      {business.name}
                    </Link>
                    <div className="mt-1 text-xs text-black/55">{business.ownerName} · {business.assignedManager}</div>
                  </div>
                </div>
                <StatePill state={business.state} />
              </div>

              <div className="mt-2.5 flex flex-wrap gap-2">
                <PlanPill plan={business.plan} />
                {business.plan !== business.effectivePlan ? <PlanPill plan={business.effectivePlan} /> : null}
                <SlaFlags flags={slaFlags} compact />
              </div>

              <div className="mobile-card-grid">
                <div>
                  <div className="mobile-card-label">Cadence</div>
                  <div className="mobile-card-value">{business.billingCadence}</div>
                </div>
                <div>
                  <div className="mobile-card-label">Next due</div>
                  <div className="mobile-card-value">{business.nextDueAt}</div>
                </div>
                <div>
                  <div className="mobile-card-label">Outstanding</div>
                  <div className="mobile-card-value">{formatCedi(business.outstandingAmount)}</div>
                </div>
                <div>
                  <div className="mobile-card-label">Reviewed</div>
                  <div className="mobile-card-value">{business.reviewedAt ?? 'Pending'}</div>
                </div>
              </div>

              {business.needsReview ? <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b35c2e]">Needs review</div> : null}

              <Link href={`/businesses/${business.id}`} className="mt-3 inline-flex w-full items-center justify-center rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-control-ink transition hover:bg-black/[0.03]">
                Open billing
              </Link>
            </div>
            );
          }) : (
            <div className="control-inline-note">No businesses match this view.</div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-8" aria-label="Select" />
                <th>Business</th>
                <th>Sold Plan</th>
                <th>Access today</th>
                <th>Cadence</th>
                <th>Next due</th>
                <th>Outstanding</th>
                <th>Reviewed by</th>
                <th>Reviewed at</th>
                <th>SLA</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pageBusinesses.map((business) => (
                <tr key={business.id}>
                  <td>
                    <input
                      type="checkbox"
                      name="selectedId"
                      value={business.id}
                      data-roster-id="businesses"
                      aria-label={`Select ${business.name}`}
                      className="h-4 w-4 rounded border-black/20 accent-[#122126]"
                    />
                  </td>
                  <td>
                    <Link href={`/businesses/${business.id}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">
                      {business.name}
                    </Link>
                    <div className="mt-1 text-xs text-black/55">{business.ownerName} · {business.assignedManager}</div>
                    {business.needsReview ? <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b35c2e]">Needs review</div> : null}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <PlanPill plan={business.plan} />
                      {business.plan !== business.effectivePlan ? <PlanPill plan={business.effectivePlan} /> : null}
                    </div>
                  </td>
                  <td><StatePill state={business.state} /></td>
                  <td className="text-sm text-black/66">{business.billingCadence}</td>
                  <td>
                    <div className="font-medium text-control-ink">{business.nextDueAt}</div>
                    <div className="mt-1 text-xs text-black/55">Last paid {business.lastPaymentAt ?? 'Not yet'}</div>
                  </td>
                  <td className="font-semibold text-control-ink">{formatCedi(business.outstandingAmount)}</td>
                  <td className="text-sm text-black/66">{business.reviewedBy ?? 'Pending'}</td>
                  <td className="text-sm text-black/66">{business.reviewedAt ?? 'Pending'}</td>
                  <td><SlaFlags flags={getSlaFlags(business)} compact /></td>
                  <td>
                    <Link href={`/businesses/${business.id}`} className="inline-flex rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-semibold text-control-ink transition hover:bg-black/[0.03]">
                      Open billing
                    </Link>
                  </td>
                </tr>
              ))}
              {pageBusinesses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-sm text-black/58">No businesses match this view.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      </BulkRosterClient>

      {roster.totalPages > 1 ? (
        <section className="control-toolbar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-black/62">{listSummary}</div>
          <div className="flex flex-wrap items-center gap-2">
            {hasPreviousPage ? (
              <Link
                href={buildBusinessesHref({ filter, search, page: roster.page - 1, pageSize: roster.pageSize })}
                  className="inline-flex h-10 items-center justify-center rounded-[18px] border border-black/10 bg-white px-4 text-sm font-semibold text-control-ink transition hover:bg-black/[0.03]"
                >
                  Previous
                </Link>
              ) : (
                <span className="inline-flex h-10 items-center justify-center rounded-[18px] border border-black/8 bg-black/[0.03] px-4 text-sm font-semibold text-black/35">
                  Previous
                </span>
              )}

            <span className="px-2 text-sm text-black/62">Page {roster.page} of {roster.totalPages}</span>

            {hasNextPage ? (
              <Link
                href={buildBusinessesHref({ filter, search, page: roster.page + 1, pageSize: roster.pageSize })}
                  className="inline-flex h-10 items-center justify-center rounded-[18px] border border-black/10 bg-white px-4 text-sm font-semibold text-control-ink transition hover:bg-black/[0.03]"
                >
                  Next
                </Link>
              ) : (
                <span className="inline-flex h-10 items-center justify-center rounded-[18px] border border-black/8 bg-black/[0.03] px-4 text-sm font-semibold text-black/35">
                  Next
                </span>
              )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
