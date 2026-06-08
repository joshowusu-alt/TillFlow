'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ScaleBusinessRecord, ScaleCockpitData } from '@/lib/scale-cockpit/types';
import { portfolioHealthTone } from '@/lib/business-health';
import {
  filterScaleBusinesses,
  paginateScaleBusinesses,
} from '@/lib/scale-cockpit/service';
import { formatBusinessType, whatsappHref } from '@/lib/scale-cockpit/labels';
import { StatePill } from '@/components/status-pill';
import type { AuditLogEntry } from '@/lib/audit';
import type { SupportIssueRow } from '@/lib/support-issues/types';
import {
  assignScaleAgentAction,
  addScaleSupportNoteAction,
  extendScaleTrialGraceAction,
  markScaleFirstSaleAction,
  markScalePaymentFollowUpAction,
  markScaleSetupCallAction,
  markReferralStatusAction,
  updateScaleReferralAction,
} from '@/app/actions/control-scale';
import {
  REFERRAL_SOURCES,
  REFERRAL_STATUSES,
  REFERRAL_SOURCE_LABELS,
  REFERRAL_STATUS_LABELS,
  SOURCE_CHANNELS,
  SOURCE_CHANNEL_LABELS,
  labelReferralSource,
  labelReferralStatus,
} from '@/lib/vendor/referrals/constants';
import { createSupportIssueAction } from '@/app/actions/control-support';
import { PIPELINE_STAGE_RECOMMENDED_ACTION } from '@/lib/scale-cockpit/labels';

type StaffOption = { id: string; name: string };

type Props = {
  data: ScaleCockpitData;
  staffOptions: StaffOption[];
  initialFilter: string;
  initialSearch: string;
  initialBusinessId: string | null;
  auditTrail: AuditLogEntry[];
  returnPath: string;
  canManageBilling: boolean;
  canWrite: boolean;
  canRecordPayments: boolean;
  supportReturnPath: string;
};

const FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'new_signups', label: 'New signups' },
  { id: 'setup_in_progress', label: 'Setup in progress' },
  { id: 'stuck_setup', label: 'Stuck setup' },
  { id: 'ready_to_sell', label: 'Ready to sell' },
  { id: 'active_business', label: 'Active business' },
  { id: 'needs_help', label: 'Needs help' },
  { id: 'trial_ending_soon', label: 'Trial ending' },
  { id: 'due_today', label: 'Due today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'restricted', label: 'Restricted' },
  { id: 'active_week', label: 'Active this week' },
  { id: 'inactive_week', label: 'Inactive' },
  { id: 'no_products', label: 'No products' },
  { id: 'no_stock', label: 'No stock' },
  { id: 'no_sales', label: 'No sales' },
  { id: 'reports_not_viewed', label: 'Reports not viewed' },
  { id: 'needs_support', label: 'Needs support' },
  { id: 'referred', label: 'Has referral source' },
  { id: 'assigned_agent', label: 'Assigned agent' },
  { id: 'demo_requested', label: 'Demo requested' },
  { id: 'demo_completed', label: 'Demo completed' },
  { id: 'referral_trial', label: 'Trial started' },
  { id: 'referral_paid', label: 'Referral paid' },
  { id: 'referral_follow_up', label: 'Follow-up due' },
  { id: 'health_critical', label: 'Health: Critical' },
  { id: 'health_at_risk', label: 'Health: At risk' },
  { id: 'health_needs_attention', label: 'Health: Needs attention' },
  { id: 'health_healthy', label: 'Health: Healthy' },
];

const PAGE_SIZE = 25;

function OverviewCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-control-line bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-control-muted">{label}</p>
      <p className="mt-2 text-2xl font-display font-bold text-control-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-control-muted">{hint}</p> : null}
    </div>
  );
}

function BusinessDetailPanel({
  record,
  returnPath,
  staffOptions,
  auditTrail,
  businessSupportIssues,
  supportReturnPath,
  canManageBilling,
  canWrite,
  canRecordPayments,
  onClose,
}: {
  record: ScaleBusinessRecord;
  returnPath: string;
  staffOptions: StaffOption[];
  auditTrail: AuditLogEntry[];
  businessSupportIssues: SupportIssueRow[];
  supportReturnPath: string;
  canManageBilling: boolean;
  canWrite: boolean;
  canRecordPayments: boolean;
  onClose: () => void;
}) {
  const wa = whatsappHref(record.ownerPhone, `Hi ${record.ownerName}, this is Tish Group about your TillFlow setup.`);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 p-0 sm:p-4">
      <div className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-control-line px-4 py-4">
          <div>
            <h2 className="text-lg font-display font-bold text-control-ink">{record.businessName}</h2>
            <p className="text-sm text-control-muted">{record.ownerName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-control-muted hover:bg-black/5">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-control-muted">Setup</p>
              <p className="font-semibold">{record.setupProgressPercent}%</p>
              <p className="text-xs">{record.activationStatusLabel}</p>
            </div>
            <div>
              <p className="text-xs text-control-muted">Billing</p>
              <p className="font-semibold">{record.billingAccessState.replace(/_/g, ' ')}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-control-muted">Portfolio health</p>
              <span
                className={`mt-1 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${portfolioHealthTone(record.portfolioHealth)}`}
              >
                {record.portfolioHealth}
              </span>
              {record.portfolioHealthReasons.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-control-muted">
                  {record.portfolioHealthReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-control-muted mt-1">{record.healthLabel}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-control-muted">Agent</p>
              <p className="font-semibold">{record.assignedAgent}</p>
            </div>
          </div>

          {record.stuckMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
              {record.stuckMessage}
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-control-muted">Next action</p>
            <p className="mt-1">{record.nextAction}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-control-muted">Contact</p>
            <p className="mt-1">{record.ownerPhone || 'No phone'}</p>
            <p>{record.ownerEmail || 'No email'}</p>
            {record.location ? <p className="text-control-muted">{record.location}</p> : null}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-control-muted">Usage</p>
            <ul className="mt-2 space-y-1 text-control-muted">
              <li>Products: {record.productCount}</li>
              <li>Opening stock: {record.hasOpeningStock ? 'Yes' : 'No'}</li>
              <li>Staff: {record.staffCount}</li>
              <li>Sales (7d): {record.salesLast7Days}</li>
              <li>Last sale: {record.lastSaleAt ?? '—'}</li>
              <li>Dashboard viewed: {record.lastOwnerDashboardViewAt ?? '—'}</li>
              <li>Report viewed: {record.lastReportViewAt ?? '—'}</li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-control-muted">Missing steps</p>
            <p className="mt-1 text-control-muted">{record.missingSteps.length ? record.missingSteps.join(', ') : 'None'}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-control-muted">Billing</p>
            <p className="mt-1">
              Plan: {record.plan} · {record.billingCadence} · trial ends {record.trialEndAt ?? '—'}
            </p>
            <p className="text-control-muted">{record.pricingLabel}</p>
            <p className="text-control-muted">
              {record.billingCadence === 'ANNUAL'
                ? `Annual charge: GHS ${record.intervalCharge.toLocaleString('en-GH')}/year`
                : `Current charge: GHS ${record.monthlyValue}/month`}
            </p>
            <p className="text-control-muted">
              {record.storefrontMode === 'included'
                ? 'Storefront: Included'
                : record.storefrontMode === 'addon'
                  ? 'Storefront: Add-on selected (+GHS 200/month)'
                  : 'Storefront: Not selected'}
              {' · '}
              Published: {record.storefrontEnabled ? 'Yes' : 'No'}
            </p>
            <p className="text-control-muted">
              Annual equivalent: GHS {record.annualEquivalentGhs.toLocaleString('en-GH')}
              {record.billingDaysRemaining != null ? ` · ${record.billingDaysRemaining} days remaining` : ''}
              {' · '}
              {record.billingAccessState.replace(/_/g, ' ')}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={`/businesses/${record.businessId}`} className="btn-secondary text-xs py-2">
              View business
            </Link>
            <Link href={`/businesses/${record.businessId}#payment-history`} className="btn-ghost text-xs py-2 border border-control-line">
              Usage & payments
            </Link>
            {canRecordPayments ? (
              <Link href={`/businesses/${record.businessId}#payment-history`} className="btn-primary text-xs py-2">
                Confirm payment
              </Link>
            ) : null}
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs py-2">
                WhatsApp owner
              </a>
            ) : null}
            {record.ownerPhone ? (
              <a href={`tel:${record.ownerPhone}`} className="btn-ghost text-xs py-2 border border-control-line">
                Call
              </a>
            ) : null}
          </div>

          {canWrite ? (
            <div className="space-y-3 border-t border-control-line pt-4">
              <form action={assignScaleAgentAction} className="space-y-2">
                <input type="hidden" name="businessId" value={record.businessId} />
                <input type="hidden" name="returnPath" value={returnPath} />
                <label className="text-xs font-semibold">Assign agent</label>
                <input name="assignedAgentName" defaultValue={record.assignedAgent} className="input w-full text-sm" list="scale-agents" />
                <datalist id="scale-agents">
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
                <button type="submit" className="btn-secondary w-full text-xs py-2">
                  Save agent
                </button>
              </form>

              <form action={addScaleSupportNoteAction} className="space-y-2">
                <input type="hidden" name="businessId" value={record.businessId} />
                <input type="hidden" name="returnPath" value={returnPath} />
                <label className="text-xs font-semibold">Support note</label>
                <textarea name="note" rows={2} className="input w-full text-sm" placeholder="What happened? Next step?" />
                <button type="submit" className="btn-secondary w-full text-xs py-2">
                  Add note
                </button>
              </form>

              <div className="grid grid-cols-2 gap-2">
                <form action={markScaleSetupCallAction}>
                  <input type="hidden" name="businessId" value={record.businessId} />
                  <input type="hidden" name="returnPath" value={returnPath} />
                  <button type="submit" className="btn-ghost w-full text-xs py-2 border border-control-line">
                    Setup call done
                  </button>
                </form>
                <form action={markScaleFirstSaleAction}>
                  <input type="hidden" name="businessId" value={record.businessId} />
                  <input type="hidden" name="returnPath" value={returnPath} />
                  <button type="submit" className="btn-ghost w-full text-xs py-2 border border-control-line">
                    First sale verified
                  </button>
                </form>
              </div>

              <div className="space-y-2 border-t border-control-line pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-control-muted">Referral / source</p>
                <p className="text-xs text-control-muted">
                  {labelReferralSource(record.referralSource)} · {labelReferralStatus(record.referralStatus)}
                </p>
                {record.referralNextFollowUpAt ? (
                  <p className="text-xs text-amber-800">Follow-up: {record.referralNextFollowUpAt.slice(0, 10)}</p>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  {(['DEMO_BOOKED', 'DEMO_COMPLETED', 'FOLLOW_UP_LATER'] as const).map((status) => (
                    <form key={status} action={markReferralStatusAction}>
                      <input type="hidden" name="businessId" value={record.businessId} />
                      <input type="hidden" name="returnPath" value={returnPath} />
                      <input type="hidden" name="referralStatus" value={status} />
                      <button type="submit" className="btn-ghost text-[10px] py-1 px-2 border border-control-line">
                        {REFERRAL_STATUS_LABELS[status]}
                      </button>
                    </form>
                  ))}
                </div>
                <form action={updateScaleReferralAction} className="space-y-2">
                  <input type="hidden" name="businessId" value={record.businessId} />
                  <input type="hidden" name="returnPath" value={returnPath} />
                  <select name="referralSource" className="input w-full text-sm" defaultValue={record.referralSource ?? ''}>
                    <option value="">Source…</option>
                    {REFERRAL_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {REFERRAL_SOURCE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <select name="sourceChannel" className="input w-full text-sm" defaultValue={record.sourceChannel ?? ''}>
                    <option value="">Channel…</option>
                    {SOURCE_CHANNELS.map((s) => (
                      <option key={s} value={s}>
                        {SOURCE_CHANNEL_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <input name="referredByName" defaultValue={record.referredByName ?? ''} className="input w-full text-sm" placeholder="Referred by name" />
                  <input name="referredByPhone" defaultValue={record.referredByPhone ?? ''} className="input w-full text-sm" placeholder="Referrer phone" />
                  <select name="referralStatus" className="input w-full text-sm" defaultValue={record.referralStatus ?? ''}>
                    <option value="">Status…</option>
                    {REFERRAL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {REFERRAL_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <input
                    name="referralNextFollowUpAt"
                    type="date"
                    className="input w-full text-sm"
                    defaultValue={record.referralNextFollowUpAt?.slice(0, 10) ?? ''}
                  />
                  <textarea
                    name="referralNotes"
                    defaultValue={record.referralNotes ?? ''}
                    className="input w-full text-sm min-h-[60px]"
                    placeholder="Referral notes"
                  />
                  <button type="submit" className="btn-secondary w-full text-xs py-2">
                    Save referral
                  </button>
                </form>
                <Link href="/command/templates" className="text-xs text-control-accent font-semibold hover:underline">
                  WhatsApp templates →
                </Link>
              </div>

              <form action={markScalePaymentFollowUpAction}>
                <input type="hidden" name="businessId" value={record.businessId} />
                <input type="hidden" name="returnPath" value={returnPath} />
                <input type="hidden" name="needed" value="true" />
                <button type="submit" className="btn-ghost w-full text-xs py-2 border border-control-line">
                  Flag payment follow-up
                </button>
              </form>
            </div>
          ) : null}

          <div className="border-t border-control-line pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-control-muted">Support issues</p>
              <Link href="/command/support" className="text-xs text-control-accent font-semibold">
                All support →
              </Link>
            </div>
            {businessSupportIssues.length === 0 ? (
              <p className="text-xs text-control-muted">No support issues for this business.</p>
            ) : (
              <ul className="space-y-2 text-xs max-h-32 overflow-y-auto">
                {businessSupportIssues.slice(0, 6).map((issue) => (
                  <li key={issue.id} className="rounded-lg border border-black/5 px-2 py-2">
                    <p className="font-medium">{issue.title}</p>
                    <p className="text-control-muted">
                      {issue.priority} · {issue.status.replace(/_/g, ' ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {canWrite ? (
              <form action={createSupportIssueAction} className="space-y-2">
                <input type="hidden" name="businessId" value={record.businessId} />
                <input type="hidden" name="returnPath" value={supportReturnPath} />
                <input name="title" className="input w-full text-sm" placeholder="New issue title" required />
                <select name="issueType" className="input w-full text-sm" defaultValue="OTHER">
                  <option value="PRODUCT_SETUP">Product setup</option>
                  <option value="IMPORT_STOCK">Import stock</option>
                  <option value="POS_ISSUE">POS issue</option>
                  <option value="BILLING_ISSUE">Billing</option>
                  <option value="OTHER">Other</option>
                </select>
                <select name="priority" className="input w-full text-sm" defaultValue="NORMAL">
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="NORMAL">Normal</option>
                  <option value="LOW">Low</option>
                </select>
                <button type="submit" className="btn-secondary w-full text-xs py-2">
                  Create support issue
                </button>
              </form>
            ) : null}
          </div>

          <div className="border-t border-control-line pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-control-muted">Audit trail</p>
            {auditTrail.length === 0 ? (
              <p className="mt-2 text-xs text-control-muted">No control actions logged yet.</p>
            ) : (
              <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs">
                {auditTrail.map((entry) => (
                  <li key={entry.id} className="rounded-lg border border-black/5 px-2 py-2">
                    <p className="font-medium text-control-ink">{entry.summary}</p>
                    <p className="text-control-muted">
                      {entry.staffEmail} · {entry.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canManageBilling ? (
            <form action={extendScaleTrialGraceAction} className="space-y-2 border-t border-control-line pt-4">
              <input type="hidden" name="businessId" value={record.businessId} />
              <input type="hidden" name="returnPath" value={returnPath} />
              <label className="text-xs font-semibold">Extend trial/grace (hours)</label>
              <input name="hours" type="number" defaultValue={48} min={24} max={168} className="input w-full text-sm" />
              <button type="submit" className="btn-primary w-full text-xs py-2">
                Extend grace
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ScaleCockpitView({
  data,
  staffOptions,
  initialFilter,
  initialSearch,
  initialBusinessId,
  auditTrail,
  returnPath,
  canManageBilling,
  canWrite,
  canRecordPayments,
  supportReturnPath,
}: Props) {
  const [filter, setFilter] = useState(initialFilter);
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(initialBusinessId);

  const filtered = useMemo(
    () => filterScaleBusinesses(data.businesses, { filter, search }),
    [data.businesses, filter, search]
  );

  const paged = useMemo(
    () => paginateScaleBusinesses(filtered, page, PAGE_SIZE),
    [filtered, page]
  );

  const selected = selectedId ? data.businesses.find((b) => b.businessId === selectedId) ?? null : null;
  const selectedSupportIssues = selectedId ? data.supportByBusiness[selectedId] ?? [] : [];
  const { overview, pipeline, actionItems } = data;

  return (
    <div className="space-y-6 pb-10">
      <Link
        href="/command/digest"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-control-accent/30 bg-control-accent/5 px-4 py-3 text-sm font-semibold text-control-accent hover:bg-control-accent/10"
      >
        <span>Daily control digest</span>
        <span className="text-xs font-normal text-control-muted">
          {actionItems.length} action{actionItems.length === 1 ? '' : 's'} · trials, setup, support, referrals
        </span>
      </Link>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <OverviewCard label="Total businesses" value={String(overview.totalBusinesses)} />
        <OverviewCard label="New this week" value={String(overview.newSignupsThisWeek)} />
        <OverviewCard label="In setup" value={String(overview.inSetup)} hint="Getting started or stuck" />
        <OverviewCard label="Active" value={String(overview.activeBusinesses)} />
        <OverviewCard label="In trial" value={String(overview.inTrial)} />
        <OverviewCard label="Paid" value={String(overview.paidBusinesses)} />
        <OverviewCard label="Overdue" value={String(overview.overdueBusinesses)} />
        <OverviewCard label="Restricted" value={String(overview.restrictedBusinesses)} />
        <OverviewCard label="Need setup help" value={String(overview.needSetupHelp)} />
        <OverviewCard label="Open support" value={String(overview.openSupportIssues)} />
        <OverviewCard label="Expected MRR" value={`GH₵ ${overview.expectedMrr.toLocaleString('en-GH')}`} />
        <OverviewCard
          label="Collections this week"
          value={`GH₵ ${overview.expectedCollectionsThisWeek.toLocaleString('en-GH')}`}
        />
        <OverviewCard label="Critical" value={String(overview.healthCritical)} hint="Act today" />
        <OverviewCard label="At risk" value={String(overview.healthAtRisk)} />
        <OverviewCard label="Needs attention" value={String(overview.healthNeedsAttention)} />
        <OverviewCard label="Healthy" value={String(overview.healthHealthy)} />
      </div>

      <section className="rounded-2xl border border-control-line bg-white p-4 shadow-sm">
        <h2 className="text-sm font-display font-bold text-control-ink">Onboarding pipeline</h2>
        <p className="mt-1 text-xs text-control-muted">Where businesses are in setup — same rules as merchant “Start properly”.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {pipeline.map((stage) => (
            <div key={stage.key} className="rounded-xl border border-black/5 bg-control-surface/40 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-control-ink">{stage.label}</p>
                <span className="text-xs font-bold text-control-accent">{stage.count}</span>
              </div>
              <p className="mt-1 text-[10px] text-control-muted">{stage.percent}% of portfolio</p>
              <p className="mt-2 text-[10px] leading-snug text-control-muted">
                {PIPELINE_STAGE_RECOMMENDED_ACTION[stage.key] ?? 'Review businesses in this stage.'}
              </p>
              {stage.businesses.length > 0 ? (
                <ul className="mt-2 space-y-1 text-[10px] text-control-ink">
                  {stage.businesses.map((b) => (
                    <li key={b.id}>
                      <button type="button" onClick={() => setSelectedId(b.id)} className="text-left hover:underline">
                        {b.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4">
        <h2 className="text-sm font-display font-bold text-control-ink">Needs action today</h2>
        {actionItems.length === 0 ? (
          <p className="mt-3 text-sm text-control-muted">No businesses need action today. Good control.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {actionItems.slice(0, 12).map((item) => (
              <li key={`${item.businessId}-${item.category}`} className="rounded-xl border border-amber-100 bg-white px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-control-ink">
                      {item.businessName} — {item.reason}
                    </p>
                    <p className="text-xs text-control-muted mt-0.5">
                      {item.ownerName} · {item.ownerPhone || 'No phone'} · {item.assignedAgent}
                    </p>
                    <p className="text-xs mt-1">Next: {item.nextAction}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.businessId)}
                      className="btn-secondary text-xs py-1.5"
                    >
                      Open
                    </button>
                    {whatsappHref(item.ownerPhone, `Hi ${item.ownerName}, Tish Group here about TillFlow.`) ? (
                      <a
                        href={whatsappHref(item.ownerPhone, `Hi ${item.ownerName}, Tish Group here about TillFlow.`)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary text-xs py-1.5"
                      >
                        WhatsApp
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-control-line bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-display font-bold text-control-ink">All businesses</h2>
            <p className="text-xs text-control-muted">
              {paged.total} match · showing {paged.startIndex}–{paged.endIndex}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, phone, agent…"
              className="input text-sm w-full sm:w-56"
            />
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
              className="input text-sm w-full sm:w-44"
            >
              {FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 hidden lg:block overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-xs">
            <thead>
              <tr className="border-b border-control-line text-control-muted">
                <th className="py-2 pr-2">Business</th>
                <th className="py-2 pr-2">Health</th>
                <th className="py-2 pr-2">Owner</th>
                <th className="py-2 pr-2">Setup</th>
                <th className="py-2 pr-2">Billing</th>
                <th className="py-2 pr-2">Stuck</th>
                <th className="py-2 pr-2">Sales 7d</th>
                <th className="py-2 pr-2">Agent</th>
                <th className="py-2 pr-2">Support</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.items.map((record) => (
                <tr key={record.businessId} className="border-b border-black/5 hover:bg-black/[0.02]">
                  <td className="py-3 pr-2">
                    <p className="font-semibold text-control-ink">{record.businessName}</p>
                    <p className="text-control-muted">{formatBusinessType(record.businessType)}</p>
                    {record.storefrontMode === 'addon' ? (
                      <p className="text-[10px] text-control-muted mt-0.5">{record.pricingLabel}</p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${portfolioHealthTone(record.portfolioHealth)}`}
                    >
                      {record.portfolioHealth}
                    </span>
                  </td>
                  <td className="py-3 pr-2">
                    <p>{record.ownerName}</p>
                    <p className="text-control-muted">{record.ownerPhone}</p>
                  </td>
                  <td className="py-3 pr-2">
                    <p>{record.setupProgressPercent}%</p>
                    <p className="text-control-muted">{record.activationStatusLabel}</p>
                  </td>
                  <td className="py-3 pr-2">
                    <StatePill state={record.billingAccessState} />
                  </td>
                  <td className="py-3 pr-2 max-w-[140px]">
                    <p className="line-clamp-2">{record.stuckMessage ?? '—'}</p>
                  </td>
                  <td className="py-3 pr-2">{record.salesLast7Days}</td>
                  <td className="py-3 pr-2">{record.assignedAgent}</td>
                  <td className="py-3 pr-2">
                    {record.openSupportIssueCount > 0 ? (
                      <>
                        <p className="font-semibold text-amber-800">{record.openSupportIssueCount} open</p>
                        <p className="text-control-muted">{record.highestSupportPriority ?? '—'}</p>
                      </>
                    ) : (
                      <span className="text-control-muted">—</span>
                    )}
                  </td>
                  <td className="py-3">
                    <button type="button" onClick={() => setSelectedId(record.businessId)} className="text-control-accent font-semibold hover:underline">
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {paged.totalPages > 1 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
            <button
              type="button"
              disabled={paged.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="btn-secondary py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-control-muted">
              Page {paged.page} of {paged.totalPages}
            </span>
            <button
              type="button"
              disabled={paged.page >= paged.totalPages}
              onClick={() => setPage((p) => Math.min(paged.totalPages, p + 1))}
              className="btn-secondary py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}

        <div className="mt-4 space-y-3 lg:hidden">
          {paged.items.map((record) => (
            <div key={record.businessId} className="rounded-xl border border-black/5 p-3">
              <p className="font-semibold">{record.businessName}</p>
              <span
                className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${portfolioHealthTone(record.portfolioHealth)}`}
              >
                {record.portfolioHealth}
              </span>
              <p className="text-xs text-control-muted mt-1">{record.ownerName} · {record.setupProgressPercent}% setup</p>
              <p className="text-xs mt-1 line-clamp-2">{record.stuckMessage ?? record.nextAction}</p>
              <button type="button" onClick={() => setSelectedId(record.businessId)} className="btn-secondary mt-2 w-full text-xs py-2">
                View details
              </button>
            </div>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="mt-6 text-center text-sm text-control-muted">No businesses match this filter.</p>
        ) : null}
      </section>

      {selected ? (
        <BusinessDetailPanel
          record={selected}
          returnPath={returnPath}
          staffOptions={staffOptions}
          auditTrail={auditTrail}
          businessSupportIssues={selectedSupportIssues}
          supportReturnPath={supportReturnPath}
          canManageBilling={canManageBilling}
          canWrite={canWrite}
          canRecordPayments={canRecordPayments}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
