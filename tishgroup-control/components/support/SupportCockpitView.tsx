'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { SupportCockpitData, SupportIssueRow } from '@/lib/support-issues/types';
import { filterSupportIssues } from '@/lib/support-issues/service';
import {
  addSupportIssueNoteAction,
  closeSupportIssueAction,
  createSupportIssueAction,
  resolveSupportIssueAction,
  updateSupportIssueAction,
} from '@/app/actions/control-support';
import {
  SUPPORT_ISSUE_TYPES,
  SUPPORT_PRIORITIES,
  SUPPORT_SOURCES,
  SUPPORT_STATUSES,
} from '@/lib/support-issues/types';

type StaffOption = { id: string; name: string };
type BusinessOption = { id: string; name: string };

type Props = {
  data: SupportCockpitData;
  staffOptions: StaffOption[];
  businessOptions: BusinessOption[];
  initialFilter: string;
  initialSearch: string;
  returnPath: string;
  canWrite: boolean;
};

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'critical', label: 'Critical' },
  { id: 'high', label: 'High priority' },
  { id: 'waiting', label: 'Waiting on customer' },
  { id: 'stale', label: 'Stale (24h+)' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'all', label: 'All' },
];

function priorityClass(priority: string) {
  if (priority === 'CRITICAL') return 'bg-rose-100 text-rose-800';
  if (priority === 'HIGH') return 'bg-amber-100 text-amber-800';
  if (priority === 'LOW') return 'bg-slate-100 text-slate-700';
  return 'bg-teal-50 text-teal-800';
}

function OverviewCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-control-line bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-control-muted">{label}</p>
      <p className="mt-2 text-2xl font-display font-bold text-control-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-control-muted">{hint}</p> : null}
    </div>
  );
}

export default function SupportCockpitView({
  data,
  staffOptions,
  businessOptions,
  initialFilter,
  initialSearch,
  returnPath,
  canWrite,
}: Props) {
  const [filter, setFilter] = useState(initialFilter);
  const [search, setSearch] = useState(initialSearch);
  const [selected, setSelected] = useState<SupportIssueRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(
    () => filterSupportIssues(data.issues, { filter, search }),
    [data.issues, filter, search]
  );

  const { overview } = data;

  return (
    <div className="space-y-6 pb-10">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <OverviewCard label="Open issues" value={String(overview.openIssues)} />
        <OverviewCard label="Critical" value={String(overview.criticalIssues)} hint="Needs action today" />
        <OverviewCard label="High priority" value={String(overview.highPriorityIssues)} />
        <OverviewCard label="Waiting on customer" value={String(overview.waitingOnCustomer)} />
        <OverviewCard label="Resolved this week" value={String(overview.resolvedThisWeek)} />
        <OverviewCard label="Avg open age" value={`${overview.averageOpenAgeHours}h`} />
        <OverviewCard label="Businesses affected" value={String(overview.businessesWithOpenIssues)} />
        <OverviewCard label="SLA attention" value={String(overview.slaAttentionCount)} hint="Stale or overdue follow-up" />
      </div>

      {(overview.criticalIssues > 0 || overview.highPriorityIssues > 0) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <strong>Support alerts:</strong> {overview.criticalIssues} critical, {overview.highPriorityIssues} high
          priority open. See{' '}
          <Link href="/command/digest" className="font-semibold underline">
            daily digest
          </Link>{' '}
          for full follow-up list.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canWrite ? (
          <button type="button" className="btn-primary text-sm" onClick={() => setShowCreate(true)}>
            Create issue
          </button>
        ) : null}
        <Link href="/command/digest" className="btn-ghost border border-control-line text-sm">
          Daily digest
        </Link>
        <Link href="/command/scale" className="btn-ghost border border-control-line text-sm">
          Scale Cockpit
        </Link>
      </div>

      {showCreate && canWrite ? (
        <form action={createSupportIssueAction} className="card space-y-3 p-4">
          <input type="hidden" name="returnPath" value={returnPath} />
          <h3 className="font-display font-bold text-control-ink">New support issue</h3>
          <select name="businessId" required className="input text-sm w-full">
            <option value="">Select business</option>
            {businessOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input name="title" required className="input text-sm w-full" placeholder="Short issue title" />
          <div className="grid gap-2 sm:grid-cols-3">
            <select name="issueType" className="input text-sm">
              {SUPPORT_ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <select name="priority" className="input text-sm">
              {SUPPORT_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select name="source" className="input text-sm">
              {SUPPORT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <textarea name="description" rows={2} className="input text-sm w-full" placeholder="What happened?" />
          <input name="nextAction" className="input text-sm w-full" placeholder="Next action for Tish Group" />
          <input name="assignedAgentName" className="input text-sm w-full" placeholder="Assigned to" list="support-agents" />
          <datalist id="support-agents">
            {staffOptions.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-sm">
              Save issue
            </button>
            <button type="button" className="btn-ghost text-sm" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <section className="rounded-2xl border border-control-line bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-display font-bold text-control-ink">Support issues</h2>
            <p className="text-xs text-control-muted">{filtered.length} shown</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search business, phone, issue…"
              className="input text-sm w-full sm:w-56"
            />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input text-sm w-full sm:w-44">
              {FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-8 text-center text-sm text-control-muted">
            {filter === 'open'
              ? 'No open support issues. Businesses are stable.'
              : filter === 'critical'
              ? 'No critical issues. Good control.'
              : 'No issues match this filter.'}
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {filtered.map((issue) => (
              <div
                key={issue.id}
                className={`rounded-xl border px-3 py-3 ${issue.isStale ? 'border-amber-200 bg-amber-50/50' : 'border-black/5'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-control-ink">
                      {issue.businessName} — {issue.title}
                    </p>
                    <p className="text-xs text-control-muted mt-0.5">
                      {issue.ownerName} · {issue.ownerPhone || 'No phone'} · {issue.issueType.replace(/_/g, ' ')}
                    </p>
                    {issue.nextAction ? (
                      <p className="text-xs mt-1">Next: {issue.nextAction}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1 items-center">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(issue.priority)}`}>
                      {issue.priority}
                    </span>
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium">{issue.status.replace(/_/g, ' ')}</span>
                    {issue.slaLabel ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                        {issue.slaLabel}
                      </span>
                    ) : issue.isStale ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">Stale</span>
                    ) : null}
                    {issue.openAgeHours > 0 ? (
                      <span className="text-[10px] text-control-muted">{issue.openAgeHours}h open</span>
                    ) : null}
                    <button type="button" className="btn-secondary text-xs py-1" onClick={() => setSelected(issue)}>
                      Manage
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {selected && canWrite ? (
        <div className="card space-y-3 p-4">
          <div className="flex justify-between">
            <h3 className="font-bold">{selected.title}</h3>
            <button type="button" className="text-sm text-control-muted" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <form action={updateSupportIssueAction} className="grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="returnPath" value={returnPath} />
            <input type="hidden" name="issueId" value={selected.id} />
            <select name="status" defaultValue={selected.status} className="input text-sm">
              {SUPPORT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <select name="priority" defaultValue={selected.priority} className="input text-sm">
              {SUPPORT_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input name="nextAction" defaultValue={selected.nextAction ?? ''} className="input text-sm sm:col-span-2" placeholder="Next action" />
            <input name="assignedAgentName" defaultValue={selected.assignedAgentName ?? ''} className="input text-sm sm:col-span-2" placeholder="Assigned to" />
            <button type="submit" className="btn-secondary text-sm sm:col-span-2">
              Save changes
            </button>
          </form>
          <form action={addSupportIssueNoteAction} className="space-y-2">
            <input type="hidden" name="issueId" value={selected.id} />
            <input type="hidden" name="returnPath" value={returnPath} />
            <textarea name="note" rows={2} className="input text-sm w-full" placeholder="Add a note" />
            <button type="submit" className="btn-ghost border border-control-line text-sm w-full">
              Add note
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            <form action={resolveSupportIssueAction}>
              <input type="hidden" name="issueId" value={selected.id} />
              <input type="hidden" name="returnPath" value={returnPath} />
              <button type="submit" className="btn-primary text-xs py-2">
                Mark resolved
              </button>
            </form>
            <form action={closeSupportIssueAction}>
              <input type="hidden" name="issueId" value={selected.id} />
              <input type="hidden" name="returnPath" value={returnPath} />
              <button type="submit" className="btn-ghost border border-control-line text-xs py-2">
                Close issue
              </button>
            </form>
            <Link href={`/command/scale?businessId=${selected.businessId}`} className="btn-ghost text-xs py-2 border border-control-line">
              Open in Scale Cockpit
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
