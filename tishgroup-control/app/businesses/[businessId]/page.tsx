import { notFound } from 'next/navigation';
import { addControlNoteAction, recordControlPaymentAction, reopenControlBusinessReviewAction, reviewControlBusinessAction, updateControlSubscriptionAction } from '@/app/actions/control-businesses';
import SectionHeading from '@/components/section-heading';
import { HealthPill, PlanPill, StatePill } from '@/components/status-pill';
import { canManageSubscriptions, canRecordPayments, canWriteNotes, listActiveControlStaff, requireControlStaff } from '@/lib/control-auth';
import { getManagedBusinessDetail } from '@/lib/control-service';
import { getActionChecklist, formatCedi } from '@/lib/control-metrics';

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asDateInput(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
}

export default async function BusinessDetailPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const staff = await requireControlStaff();
  const [business, staffOptions] = await Promise.all([
    getManagedBusinessDetail(params.businessId),
    listActiveControlStaff(),
  ]);

  if (!business) {
    notFound();
  }

  const resolvedSearchParams = (
    searchParams && typeof (searchParams as Promise<Record<string, string | string[] | undefined>>).then === 'function'
      ? await searchParams
      : (searchParams ?? {})
  ) as Record<string, string | string[] | undefined>;

  const checklist = getActionChecklist(business);
  const updated = readSearchParam(resolvedSearchParams.updated);
  const error = readSearchParam(resolvedSearchParams.error);
  const canEditSubscription = canManageSubscriptions(staff.role);
  const canTakePayments = canRecordPayments(staff.role);
  const canAddNotes = canWriteNotes(staff.role);

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      {updated === 'subscription' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Subscription settings were saved in Tishgroup Control and mirrored back into Tillflow billing fields, including start date and billing cadence.
        </div>
      ) : null}

      {updated === 'payment' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Payment recorded. Tillflow entitlement fields were updated, so access restoration follows immediately.
        </div>
      ) : null}

      {updated === 'note' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Internal note saved to the control plane and appended to the Tillflow commercial record.
        </div>
      ) : null}

      {updated === 'review' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Business review saved. The account is now out of the unreviewed queue, and any sold-plan change you selected has been applied.
        </div>
      ) : null}

      {updated === 'reopened' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          This business has been returned to the review queue. It will now appear again in the unreviewed list until TG completes another review.
        </div>
      ) : null}

      <section className="panel p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <SectionHeading
            eyebrow="Business detail"
            title={business.name}
            description="The control-plane detail view combines commercial state, owner relationship context, and the exact next operational action for Tishgroup."
          />
          <div className="flex flex-wrap gap-2">
            <PlanPill plan={business.plan} />
            <StatePill state={business.state} />
            <HealthPill health={business.health} />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-black/8 bg-white/80 px-4 py-4 text-sm text-black/66">
          <strong className="text-control-ink">Commercial source:</strong> {business.commercialSource === 'CONTROL_PLANE'
            ? ' Tishgroup Control owns the subscription record for this business and Tillflow mirrors it for enforcement.'
            : ' This business is still running from Tillflow-derived billing fields until the first control-plane subscription or payment write is recorded.'}
        </div>

        {business.needsReview ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            This account is still marked as unreviewed. Confirm the owner, assign a manager, and save an initial review to take it out of the new-accounts queue.
          </div>
        ) : null}

        {!business.needsReview ? (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-900">
            This business has already been reviewed. If the customer changes commercial direction later, use the subscription editor below to move them to Growth or Pro, or send the account back to the review queue for another TG review.
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="panel p-6">
            <SectionHeading
              eyebrow="Commercial snapshot"
              title="What Tishgroup needs to know right now"
              description="This is the live account posture: what was sold, what access remains, what money is outstanding, and what relationship owner is on point."
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Purchased plan</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{business.plan}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Effective access</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{business.effectivePlan}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Outstanding</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{formatCedi(business.outstandingAmount)}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Signed up</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{business.signedUpAt}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Subscription start</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{business.subscriptionStartAt ?? 'Not recorded'}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Next due</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{business.nextDueAt}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Assigned manager</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{business.assignedManager}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Support status</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{business.supportStatus}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Reviewed at</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{business.reviewedAt ?? 'Not reviewed yet'}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Reviewed by</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{business.reviewedBy ?? 'Not reviewed yet'}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Subscription status</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{business.subscriptionStatus}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Billing cadence</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{business.billingCadence}</div>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 p-4">
                <div className="eyebrow">Trial end</div>
                <div className="mt-2 text-lg font-semibold text-control-ink">{business.trialEndsAt ?? 'No active trial'}</div>
              </div>
            </div>
          </div>

          <div className="panel p-6">
            <SectionHeading
              eyebrow="Relationship note"
              title="Current operating context"
              description="The notes layer should stay short and actionable so any Tishgroup operator can take over the account without losing context."
            />
            <p className="mt-5 rounded-2xl border border-black/8 bg-white/80 p-4 text-sm leading-7 text-black/68">
              {business.notes}
            </p>
          </div>

          <div className="panel p-6">
            <SectionHeading
              eyebrow="Payment history"
              title="Recent recorded payments"
              description="These are the control-plane payment records that should line up with Tillflow access restoration and next-due scheduling."
            />
            <div className="mt-5 space-y-3">
              {business.recentPayments.length > 0 ? business.recentPayments.map((payment) => (
                <div key={payment.id} className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4 text-sm text-black/66">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="font-semibold text-control-ink">{formatCedi(payment.amountPence)} via {payment.method}</div>
                    <div>{payment.paidAt}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-black/56">
                    <span>Recorded by {payment.receivedBy}</span>
                    {payment.reference ? <span>Reference: {payment.reference}</span> : null}
                  </div>
                  {payment.note ? <p className="mt-3 leading-6 text-black/64">{payment.note}</p> : null}
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-black/12 bg-white/70 px-4 py-4 text-sm text-black/56">
                  No control-plane payment records yet.
                </div>
              )}
            </div>
          </div>

          <div className="panel p-6">
            <SectionHeading
              eyebrow="Internal notes"
              title="Recent account context"
              description="Short internal notes keep collections, support, and account management aligned on the same commercial story."
            />
            <div className="mt-5 space-y-3">
              {business.recentNotes.length > 0 ? business.recentNotes.map((note) => (
                <div key={note.id} className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4 text-sm text-black/66">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="font-semibold text-control-ink">{note.category}</div>
                    <div>{note.createdAt}</div>
                  </div>
                  <p className="mt-3 leading-7">{note.note}</p>
                  <div className="mt-3 text-xs text-black/56">Added by {note.createdBy}</div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-black/12 bg-white/70 px-4 py-4 text-sm text-black/56">
                  No internal control notes recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel p-6">
            <SectionHeading
              eyebrow="Owner contact"
              title="Primary relationship record"
              description="Keep the commercial contact current. Billing delays often come from broken follow-up rather than unwillingness to pay."
            />
            <div className="mt-5 space-y-3 text-sm leading-6 text-black/68">
              <div><strong className="text-control-ink">Owner:</strong> {business.ownerName}</div>
              <div><strong className="text-control-ink">Phone:</strong> {business.ownerPhone}</div>
              <div><strong className="text-control-ink">Email:</strong> {business.ownerEmail}</div>
              <div><strong className="text-control-ink">Branches:</strong> {business.branches}</div>
              <div><strong className="text-control-ink">Last activity:</strong> {business.lastActivityAt}</div>
            </div>
          </div>

          <div className="panel p-6">
            <SectionHeading
              eyebrow="Next action"
              title="Tishgroup checklist"
              description="Every account state should have a clear operating playbook so the team acts consistently across the full portfolio."
            />
            <ol className="mt-5 space-y-3 text-sm leading-6 text-black/68">
              {checklist.map((item) => (
                <li key={item} className="rounded-2xl border border-black/8 bg-white/80 px-4 py-3">
                  {item}
                </li>
              ))}
            </ol>
          </div>

          <div className="panel p-6">
            <SectionHeading
              eyebrow="Review queue"
              title="Ownership and first review"
              description="Use this once for new accounts, or any time TG needs to reassign the relationship owner. You can also set the sold plan, start date, and monthly or annual billing here."
            />

            {!business.needsReview ? (
              <form action={reopenControlBusinessReviewAction} className="mt-5 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <input type="hidden" name="businessId" value={business.id} />

                <div>
                  <h3 className="text-sm font-semibold text-control-ink">Send back to review queue</h3>
                  <p className="mt-1 text-sm text-black/60">Use this when a previously reviewed business needs another commercial review before TG confirms the next step.</p>
                </div>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-control-ink">Reason for re-review</span>
                  <textarea name="reviewNote" rows={3} placeholder="Explain why this business needs another commercial review, for example a requested move to Growth." className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
                </label>

                <button type="submit" className="inline-flex w-full items-center justify-center rounded-2xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-control-ink transition hover:bg-amber-100 sm:w-fit">
                  Send back to review queue
                </button>
              </form>
            ) : null}

            <form action={reviewControlBusinessAction} className="mt-5 space-y-3 rounded-2xl border border-black/8 bg-white/80 p-4">
              <input type="hidden" name="businessId" value={business.id} />

              <label className="block space-y-1 text-sm">
                <span className="font-medium text-control-ink">Assigned manager</span>
                <select name="assignedManagerId" defaultValue={business.assignedManagerId ?? 'SELF'} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                  <option value="SELF">Assign to me</option>
                  <option value="UNASSIGNED">Leave unassigned</option>
                  {staffOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name} · {option.role.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1 text-sm">
                <span className="font-medium text-control-ink">Sold plan for this business</span>
                <select name="purchasedPlan" defaultValue="KEEP_CURRENT" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                  <option value="KEEP_CURRENT">Keep current sold plan</option>
                  <option value="STARTER">Starter</option>
                  <option value="GROWTH">Growth</option>
                  <option value="PRO">Pro</option>
                </select>
              </label>

              <label className="block space-y-1 text-sm">
                <span className="font-medium text-control-ink">Billing cadence</span>
                <select name="billingCadence" defaultValue={business.billingCadence} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                  <option value="MONTHLY">Monthly</option>
                  <option value="ANNUAL">Annual</option>
                </select>
              </label>

              <label className="block space-y-1 text-sm">
                <span className="font-medium text-control-ink">Subscription start date</span>
                <input type="date" name="startDate" defaultValue={asDateInput(business.subscriptionStartAt ?? business.planSetAt)} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="font-medium text-control-ink">First due date</span>
                <input type="date" name="nextDueDate" defaultValue={asDateInput(business.nextDueAt)} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
              </label>

              <p className="text-sm text-black/60">
                If you leave first due date blank, TG Control will calculate it from the start date and billing cadence.
              </p>

              <label className="block space-y-1 text-sm">
                <span className="font-medium text-control-ink">Review note</span>
                <textarea name="reviewNote" rows={3} placeholder="Capture the first commercial review, owner confirmation, or assignment context." className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
              </label>

              <button type="submit" className="inline-flex w-full items-center justify-center rounded-2xl border border-black/12 bg-white px-4 py-3 text-sm font-semibold text-control-ink transition hover:bg-black/[0.03] sm:w-fit">
                Save review and assignment
              </button>
            </form>
          </div>

          <div className="panel p-6">
            <SectionHeading
              eyebrow="Control actions"
              title="Sold plan, billing, and payments"
              description="Use this detailed editor for later commercial changes after the first review, including moving a reviewed business from Starter to Growth or Pro. Tillflow follows these records instead of competing with them."
            />

            <div className="mt-5 space-y-4">
              {canEditSubscription ? (
                <form action={updateControlSubscriptionAction} className="space-y-3 rounded-2xl border border-black/8 bg-white/80 p-4">
                  <input type="hidden" name="businessId" value={business.id} />
                  <div>
                    <h3 className="text-sm font-semibold text-control-ink">Update subscription</h3>
                    <p className="mt-1 text-sm text-black/60">Set the sold plan, cadence, and current subscription state from the control plane.</p>
                  </div>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Sold plan</span>
                    <select name="purchasedPlan" defaultValue={business.plan} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                      <option value="STARTER">Starter</option>
                      <option value="GROWTH">Growth</option>
                      <option value="PRO">Pro</option>
                    </select>
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Billing cadence</span>
                    <select name="billingCadence" defaultValue={business.billingCadence} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                      <option value="MONTHLY">Monthly</option>
                      <option value="ANNUAL">Annual</option>
                    </select>
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Subscription start date</span>
                    <input type="date" name="startDate" defaultValue={asDateInput(business.subscriptionStartAt ?? business.planSetAt)} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Subscription status</span>
                    <select name="status" defaultValue={business.subscriptionStatus} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                      <option value="ACTIVE">Active</option>
                      <option value="TRIAL">Trial</option>
                      <option value="SUSPENDED">Suspended</option>
                      <option value="READ_ONLY">Read only</option>
                    </select>
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Next due date</span>
                    <input type="date" name="nextDueDate" defaultValue={asDateInput(business.nextDueAt)} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
                  </label>

                  <p className="text-sm text-black/60">
                    Leave next due blank to calculate it automatically from the subscription start date and cadence.
                  </p>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Trial end date</span>
                    <input type="date" name="trialEndsAt" defaultValue={asDateInput(business.trialEndsAt)} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Monthly value</span>
                    <input type="number" min="0" name="monthlyValuePence" defaultValue={business.monthlyValue} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Outstanding amount</span>
                    <input type="number" min="0" name="outstandingAmountPence" defaultValue={business.outstandingAmount} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
                  </label>

                  <button type="submit" className="inline-flex w-full items-center justify-center rounded-2xl bg-[#122126] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0d1a1e] sm:w-fit">
                    Save subscription state
                  </button>
                </form>
              ) : (
                <div className="rounded-2xl border border-dashed border-black/12 bg-white/70 px-4 py-4 text-sm text-black/56">
                  Your role can view subscription state but cannot change it.
                </div>
              )}

              {canTakePayments ? (
                <form action={recordControlPaymentAction} className="space-y-3 rounded-2xl border border-black/8 bg-white/80 p-4">
                  <input type="hidden" name="businessId" value={business.id} />
                  <div>
                    <h3 className="text-sm font-semibold text-control-ink">Record payment</h3>
                    <p className="mt-1 text-sm text-black/60">This creates a payment record and restores Tillflow entitlement state immediately.</p>
                  </div>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Amount</span>
                    <input type="number" min="0" name="amountPence" defaultValue={business.outstandingAmount || business.monthlyValue} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" required />
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Method</span>
                    <select name="method" defaultValue="MOMO" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                      <option value="MOMO">MoMo</option>
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="CASH">Cash</option>
                      <option value="INVOICE">Invoice</option>
                    </select>
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Billing cadence</span>
                    <select name="billingCadence" defaultValue={business.billingCadence} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                      <option value="MONTHLY">Monthly</option>
                      <option value="ANNUAL">Annual</option>
                    </select>
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Paid at</span>
                    <input type="date" name="paidAt" defaultValue={new Date().toISOString().slice(0, 10)} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Next due date</span>
                    <input type="date" name="nextDueDate" defaultValue={asDateInput(business.nextDueAt)} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Reference</span>
                    <input type="text" name="reference" placeholder="Transaction or receipt reference" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Payment note</span>
                    <textarea name="note" rows={3} placeholder="Anything important about this payment or recovery step" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" />
                  </label>

                  <button type="submit" className="inline-flex w-full items-center justify-center rounded-2xl bg-[#1f8a82] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#166a64] sm:w-fit">
                    Record payment
                  </button>
                </form>
              ) : (
                <div className="rounded-2xl border border-dashed border-black/12 bg-white/70 px-4 py-4 text-sm text-black/56">
                  Your role can view payment history but cannot record payments.
                </div>
              )}

              {canAddNotes ? (
                <form action={addControlNoteAction} className="space-y-3 rounded-2xl border border-black/8 bg-white/80 p-4">
                  <input type="hidden" name="businessId" value={business.id} />
                  <div>
                    <h3 className="text-sm font-semibold text-control-ink">Add internal note</h3>
                    <p className="mt-1 text-sm text-black/60">Use short factual notes that another operator can act on immediately.</p>
                  </div>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Category</span>
                    <select name="category" defaultValue="GENERAL" className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]">
                      <option value="GENERAL">General</option>
                      <option value="COLLECTIONS">Collections</option>
                      <option value="SUPPORT">Support</option>
                      <option value="UPSELL">Upsell</option>
                      <option value="RISK">Risk</option>
                    </select>
                  </label>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-control-ink">Internal note</span>
                    <textarea name="note" rows={4} placeholder="Record the relevant context, promise, blocker, or next step." className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-control-ink outline-none transition focus:border-[#1f8a82]" required />
                  </label>

                  <button type="submit" className="inline-flex w-full items-center justify-center rounded-2xl border border-black/12 bg-white px-4 py-3 text-sm font-semibold text-control-ink transition hover:bg-black/[0.03] sm:w-fit">
                    Save note
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}