import Link from 'next/link';
import { bulkReviewControlBusinessesAction, updateControlSubscriptionAction } from '@/app/actions/control-businesses';
import SectionHeading from '@/components/section-heading';
import { HealthPill, PlanPill, StatePill } from '@/components/status-pill';
import { listActiveControlStaff, requireControlStaff } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';
import { formatCedi } from '@/lib/control-metrics';

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  await requireControlStaff();
  const [managedBusinesses, staffOptions] = await Promise.all([
    listManagedBusinesses(),
    listActiveControlStaff(),
  ]);
  const resolvedSearchParams = (
    searchParams && typeof (searchParams as Promise<Record<string, string | string[] | undefined>>).then === 'function'
      ? await searchParams
      : (searchParams ?? {})
  ) as Record<string, string | string[] | undefined>;
  const filter = readSearchParam(resolvedSearchParams.filter) === 'unreviewed' ? 'unreviewed' : 'all';
  const error = readSearchParam(resolvedSearchParams.error);
  const updated = readSearchParam(resolvedSearchParams.updated);
  const filteredBusinesses = filter === 'unreviewed'
    ? managedBusinesses.filter((business) => business.needsReview)
    : managedBusinesses;
  const unreviewedCount = managedBusinesses.filter((business) => business.needsReview).length;

  return (
    <div className="space-y-6">
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

      <section className="panel p-6">
        <SectionHeading
          eyebrow="Managed businesses"
          title="Cross-tenant commercial roster"
          description="This is the operational list Tishgroup uses every day: who owns the relationship, what the business bought, what access they have today, and whether the account needs action."
        />
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link
            href="/businesses"
            className={`inline-flex rounded-full px-3 py-1.5 font-semibold ${filter === 'all' ? 'bg-[#122126] text-white' : 'border border-black/10 bg-white text-black/64'}`}
          >
            All businesses ({managedBusinesses.length})
          </Link>
          <Link
            href="/businesses?filter=unreviewed"
            className={`inline-flex rounded-full px-3 py-1.5 font-semibold ${filter === 'unreviewed' ? 'bg-[#1f8a82] text-white' : 'border border-black/10 bg-white text-black/64'}`}
          >
            Unreviewed only ({unreviewedCount})
          </Link>
        </div>
      </section>

      <section className="panel p-6">
        <SectionHeading
          eyebrow="Billing setup"
          title="Select a business and set its commercial plan"
          description="Use this quick panel to pick a business, move it between Starter, Growth, and Pro, and set the subscription start date plus monthly or annual billing without opening a separate screen."
        />

        <form action={updateControlSubscriptionAction} className="mt-5 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="returnPath" value="/businesses" />
          <input type="hidden" name="status" value="ACTIVE" />

          <label className="block space-y-1 text-sm sm:col-span-2">
            <span className="font-medium text-control-ink">Business</span>
            <select name="businessId" defaultValue={filteredBusinesses[0]?.id ?? managedBusinesses[0]?.id ?? ''} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" required>
              {managedBusinesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name} · {business.plan} · {business.billingCadence}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-control-ink">Sold plan</span>
            <select name="purchasedPlan" defaultValue="STARTER" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
              <option value="STARTER">Starter</option>
              <option value="GROWTH">Growth</option>
              <option value="PRO">Pro</option>
            </select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-control-ink">Billing cadence</span>
            <select name="billingCadence" defaultValue="MONTHLY" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-control-ink">Subscription start date</span>
            <input type="date" name="startDate" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-control-ink">First due date</span>
            <input type="date" name="nextDueDate" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
          </label>

          <p className="text-sm text-black/60 sm:col-span-2">
            Leave the first due date blank to let TG Control calculate it from the start date and whether the business is monthly or annual.
          </p>

          <button type="submit" className="inline-flex h-[50px] items-center justify-center rounded-2xl bg-[#122126] px-5 text-sm font-semibold text-white transition hover:bg-[#0d1a1e] sm:col-span-2 sm:w-fit">
            Save billing setup
          </button>
        </form>
      </section>

      {filter === 'unreviewed' && filteredBusinesses.length > 0 ? (
        <section className="panel p-6">
          <SectionHeading
            eyebrow="Bulk review"
            title="Assign and clear the queue"
            description="This lets TG assign the current unreviewed set to a manager, mark them reviewed, and optionally set the sold plan to Growth or Pro in one pass."
          />

          <form action={bulkReviewControlBusinessesAction} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="businessIds" value={filteredBusinesses.map((business) => business.id).join(',')} />

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-control-ink">Assigned manager</span>
              <select name="assignedManagerId" defaultValue="SELF" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                <option value="SELF">Assign to me</option>
                <option value="UNASSIGNED">Leave unassigned</option>
                {staffOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name} · {option.role.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-control-ink">Sold plan</span>
              <select name="purchasedPlan" defaultValue="KEEP_CURRENT" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                <option value="KEEP_CURRENT">Keep current sold plan</option>
                <option value="STARTER">Starter</option>
                <option value="GROWTH">Growth</option>
                <option value="PRO">Pro</option>
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-control-ink">Billing cadence</span>
              <select name="billingCadence" defaultValue="MONTHLY" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                <option value="MONTHLY">Monthly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-control-ink">Subscription start date</span>
              <input type="date" name="startDate" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-control-ink">First due date</span>
              <input type="date" name="nextDueDate" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
            </label>

            <label className="block space-y-1 text-sm sm:col-span-2">
              <span className="font-medium text-control-ink">Bulk review note</span>
              <input type="text" name="reviewNote" placeholder="Optional note to append to each reviewed business" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
            </label>

            <button type="submit" className="inline-flex h-[50px] items-center justify-center rounded-2xl bg-[#122126] px-5 text-sm font-semibold text-white transition hover:bg-[#0d1a1e] sm:col-span-2 sm:w-fit">
              Review {filteredBusinesses.length} businesses
            </button>
          </form>
        </section>
      ) : null}

      <section className="panel overflow-hidden p-0">
        <div className="space-y-3 p-4 md:hidden">
          {filteredBusinesses.length > 0 ? filteredBusinesses.map((business) => (
            <div key={business.id} className="mobile-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/businesses/${business.id}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">
                    {business.name}
                  </Link>
                  <div className="mt-1 text-xs text-black/55">{business.ownerName} · {business.assignedManager}</div>
                </div>
                <HealthPill health={business.health} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <PlanPill plan={business.plan} />
                {business.plan !== business.effectivePlan ? <PlanPill plan={business.effectivePlan} /> : null}
                <StatePill state={business.state} />
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

              <Link href={`/businesses/${business.id}`} className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-control-ink transition hover:bg-black/[0.03]">
                Open billing
              </Link>
            </div>
          )) : (
            <div className="mobile-card text-sm text-black/58">No businesses match this filter.</div>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Sold Plan</th>
                <th>Access today</th>
                <th>Cadence</th>
                <th>Next due</th>
                <th>Outstanding</th>
                <th>Reviewed by</th>
                <th>Reviewed at</th>
                <th>Health</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredBusinesses.map((business) => (
                <tr key={business.id}>
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
                  <td><HealthPill health={business.health} /></td>
                  <td>
                    <Link href={`/businesses/${business.id}`} className="inline-flex rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm font-semibold text-control-ink transition hover:bg-black/[0.03]">
                      Open billing
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredBusinesses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-sm text-black/58">No businesses match this filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}