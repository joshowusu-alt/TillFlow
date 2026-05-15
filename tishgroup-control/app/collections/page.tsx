import Link from 'next/link';
import ControlPageHeader from '@/components/control-page-header';
import SectionHeading from '@/components/section-heading';
import { StatePill } from '@/components/status-pill';
import BulkRemindButton from '@/components/bulk-remind-button';
import { bulkRemindDueSoonAction } from '@/app/actions/control-businesses';
import { canRecordPayments, canManageSubscriptions, requireControlStaff } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';
import { formatCedi, getCollectionQueuesFor } from '@/lib/control-metrics';
import { readSearchParam, resolveSearchParams, type ControlSearchParams } from '@/lib/search-params';
import type { ManagedBusiness } from '@/lib/control-data';

export const dynamic = 'force-dynamic';

type SortKey = 'overdue' | 'amount' | 'manager';

function readPreviewSize(value: string | string[] | undefined) {
  const rawValue = readSearchParam(value);
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 25) return 25;
  if (parsed <= 50) return 50;
  return 100;
}

function readSort(value: string | string[] | undefined): SortKey {
  const raw = readSearchParam(value);
  if (raw === 'amount' || raw === 'manager') return raw;
  return 'overdue';
}

function buildCollectionsHref(overrides: { view?: string; preview?: number; sort?: string }, current: { view: string; preview: number; sort: string }) {
  const params = new URLSearchParams();
  const view = overrides.view ?? current.view;
  const preview = overrides.preview ?? current.preview;
  const sort = overrides.sort ?? current.sort;
  if (view === 'all') params.set('view', 'all');
  if (preview !== 25) params.set('preview', String(preview));
  if (sort !== 'overdue') params.set('sort', sort);
  const qs = params.toString();
  return qs ? `/collections?${qs}` : '/collections';
}

function toPhoneHref(phone: string) {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : '#';
}

function daysFromNow(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr.slice(0, 10));
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function getAccountMove(state: string, nextDueAt: string): string {
  const days = daysFromNow(nextDueAt);
  const overdue = Math.abs(days);
  switch (state) {
    case 'DUE_SOON':
      return days <= 1
        ? `Due tomorrow — send reminder now and confirm MoMo or bank transfer.`
        : `Due in ${days} day${days === 1 ? '' : 's'} — send reminder and confirm payment channel.`;
    case 'GRACE':
      return `${overdue} day${overdue === 1 ? '' : 's'} past due — call now and push for same-day MoMo or transfer.`;
    case 'STARTER_FALLBACK':
      return `${overdue} day${overdue === 1 ? '' : 's'} past due, access downgraded — escalate for partial or full payment today.`;
    case 'READ_ONLY':
      return `${overdue} day${overdue === 1 ? '' : 's'} past due, account locked — confirm payment first to restore access immediately.`;
    default:
      return `Account in good standing — confirm renewal prep and upsell readiness.`;
  }
}

function sortBusinesses(items: ManagedBusiness[], sort: SortKey): ManagedBusiness[] {
  const sorted = [...items];
  switch (sort) {
    case 'amount':
      return sorted.sort((a, b) => b.outstandingAmount - a.outstandingAmount);
    case 'manager':
      return sorted.sort((a, b) => a.assignedManager.localeCompare(b.assignedManager));
    case 'overdue':
    default:
      return sorted.sort((a, b) => daysFromNow(a.nextDueAt) - daysFromNow(b.nextDueAt));
  }
}

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams?: Promise<ControlSearchParams> | ControlSearchParams;
}) {
  const staff = await requireControlStaff();
  const canRemind = canRecordPayments(staff.role) || canManageSubscriptions(staff.role);
  const resolvedSearchParams = await resolveSearchParams(searchParams);
  const view = readSearchParam(resolvedSearchParams.view) === 'all' ? 'all' : 'preview';
  const previewSize = readPreviewSize(resolvedSearchParams.preview);
  const sort = readSort(resolvedSearchParams.sort);
  const current = { view, preview: previewSize, sort };

  const businesses = await listManagedBusinesses();
  const queues = getCollectionQueuesFor(businesses);
  const queueEntries = [
    {
      key: 'healthy',
      title: 'Healthy accounts',
      description: 'No immediate collection pressure. Use these for relationship health and upsell review.',
      bestMove: 'Review relationship quality and confirm next commercial expansion move.',
      responseWindow: 'This week',
      items: sortBusinesses(queues.healthy, sort),
    },
    {
      key: 'dueSoon',
      title: 'Due soon',
      description: 'Reminder queue before the account tips into overdue handling.',
      bestMove: 'Send reminder before the due date and confirm exact payment channel.',
      responseWindow: 'Within 24 hours',
      items: sortBusinesses(queues.dueSoon, sort),
    },
    {
      key: 'overdue',
      title: 'Overdue but still operating',
      description: 'These businesses are in grace or fallback. Same-day follow-up matters here.',
      bestMove: 'Escalate same day and make the fallback or lock timeline explicit.',
      responseWindow: 'Same day',
      items: sortBusinesses(queues.overdue, sort),
    },
    {
      key: 'locked',
      title: 'Locked or read-only',
      description: 'These accounts need payment confirmation or a deliberate commercial decision.',
      bestMove: 'Verify payment fast or decide whether the account should remain restricted.',
      responseWindow: 'Immediate',
      items: sortBusinesses(queues.locked, sort),
    },
  ];
  const headerStats = [
    { label: 'Healthy accounts', value: String(queues.healthy.length), hint: 'No immediate collections pressure.' },
    { label: 'Due soon', value: String(queues.dueSoon.length), hint: 'Reminder queue before overdue handling starts.' },
    { label: 'Overdue', value: String(queues.overdue.length), hint: 'Accounts already consuming same-day collections attention.' },
    { label: 'Locked', value: String(queues.locked.length), hint: 'Accounts needing payment confirmation or a restriction decision.' },
  ];

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'overdue', label: 'Most overdue first' },
    { key: 'amount', label: 'Highest amount first' },
    { key: 'manager', label: 'By manager' },
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      <ControlPageHeader
        eyebrow="Collections board"
        title="Queue-first collections control."
        description="Work reminders first, then same-day overdue recovery, then locked accounts. The page should tell the team what queue to open next."
        chips={queueEntries.map((queue) => ({ label: queue.title, href: `#${queue.key}` }))}
        stats={headerStats}
        aside={(
          <div className="space-y-4">
            <div>
              <div className="eyebrow">Pass order</div>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight">Work the right queue next</h2>
            </div>
            <div className="control-priority-list">
              {queueEntries.slice(1).map((queue, index) => (
                <div key={queue.key} className="control-priority-item control-priority-item-tonal">
                  <div className="flex items-start gap-3">
                    <span className="control-sequence-step">{index + 1}</span>
                    <div>
                      <div className="font-semibold">{queue.title}</div>
                      <div className="mt-1 text-sm text-white/70">{queue.bestMove}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-[18px] border border-white/10 bg-white/6 px-3.5 py-3 text-sm leading-6 text-white/74">
              Preview mode stays the default so large portfolios remain fast on mobile and low-power devices.
            </div>
          </div>
        )}
      />

      <section className="control-toolbar">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-black/62">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildCollectionsHref({ view: 'preview' }, current)}
              className={`inline-flex rounded-full px-3 py-1.5 font-semibold ${view === 'preview' ? 'bg-control-dark text-white' : 'border border-black/10 bg-white text-black/64'}`}
            >
              Preview mode
            </Link>
            <Link
              href={buildCollectionsHref({ view: 'all' }, current)}
              className={`inline-flex rounded-full px-3 py-1.5 font-semibold ${view === 'all' ? 'bg-control-teal text-white' : 'border border-black/10 bg-white text-black/64'}`}
            >
              Show all queues
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {sortOptions.map((option) => (
              <Link
                key={option.key}
                href={buildCollectionsHref({ sort: option.key }, current)}
                className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${sort === option.key ? 'bg-control-ink text-white' : 'border border-black/10 bg-white text-black/56'}`}
              >
                {option.label}
              </Link>
            ))}

            <form action="/collections" method="get" className="flex items-center gap-2">
              {view === 'all' ? <input type="hidden" name="view" value="all" /> : null}
              {sort !== 'overdue' ? <input type="hidden" name="sort" value={sort} /> : null}
              <label className="sr-only">Cards per queue</label>
              <select name="preview" defaultValue={String(previewSize)} className="control-field min-w-[150px]">
                <option value="25">Show 25 per queue</option>
                <option value="50">Show 50 per queue</option>
                <option value="100">Show 100 per queue</option>
              </select>
              <button type="submit" className="inline-flex h-[42px] items-center justify-center rounded-[18px] border border-black/10 bg-white px-4 text-sm font-semibold text-control-ink transition hover:bg-black/[0.03]">
                Update
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {queueEntries.map((queue) => {
          const visibleItems = view === 'all' ? queue.items : queue.items.slice(0, previewSize);
          const hiddenCount = Math.max(queue.items.length - visibleItems.length, 0);

          return (
            <div key={queue.key} id={queue.key} className="panel p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionHeading eyebrow="Queue" title={queue.title} description={queue.description} />
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-black/50">
                    {queue.items.length} account{queue.items.length === 1 ? '' : 's'}
                  </div>
                  {queue.key === 'dueSoon' && queue.items.length > 0 && canRemind ? (
                    <BulkRemindButton count={queue.items.length} action={bulkRemindDueSoonAction} />
                  ) : null}
                </div>
              </div>
              <div className="mt-4 control-inline-note">
                <strong className="text-control-ink">Best move:</strong> {queue.bestMove} <span className="text-black/35">•</span> <strong className="text-control-ink">Window:</strong> {queue.responseWindow}
              </div>
              <div className="mt-4 space-y-2.5">
                {visibleItems.map((business) => (
                  <div key={business.id} className="control-list-row">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-control-ink">{business.name}</div>
                        <div className="mt-1 text-xs text-black/55">{business.ownerName} · {business.ownerPhone}</div>
                      </div>
                      <StatePill state={business.state} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-black/62">
                      <span>Due <strong className="text-control-ink">{business.nextDueAt}</strong></span>
                      <span>Outstanding <strong className="text-control-ink">{formatCedi(business.outstandingAmount)}</strong></span>
                      <span>Manager <strong className="text-control-ink">{business.assignedManager}</strong></span>
                    </div>
                    <div className="mt-3 text-sm leading-5 text-black/62">
                      {getAccountMove(business.state, business.nextDueAt)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={toPhoneHref(business.ownerPhone)}
                        className="inline-flex items-center justify-center rounded-[16px] border border-black/10 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-control-ink transition hover:bg-black/[0.03]"
                      >
                        Call owner
                      </a>
                      <Link
                        href={`/businesses/${business.id}`}
                        className="inline-flex items-center justify-center rounded-[16px] border border-black/10 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-control-ink transition hover:bg-black/[0.03]"
                      >
                        Open account
                      </Link>
                    </div>
                  </div>
                ))}
                {visibleItems.length === 0 ? (
                  <div className="control-inline-note">No accounts are currently in this queue.</div>
                ) : null}
                {hiddenCount > 0 ? (
                  <div className="control-inline-note">
                    {hiddenCount} more account{hiddenCount === 1 ? '' : 's'} hidden in preview mode.
                  </div>
                ) : null}
                {hiddenCount > 0 ? (
                  <Link href={`${buildCollectionsHref({ view: 'all' }, current)}#${queue.key}`} className="inline-flex text-sm font-semibold text-control-ink underline-offset-4 hover:underline">
                    Show all {queue.items.length}
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
