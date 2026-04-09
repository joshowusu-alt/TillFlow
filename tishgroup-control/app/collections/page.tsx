import Link from 'next/link';
import ControlPageHeader from '@/components/control-page-header';
import SectionHeading from '@/components/section-heading';
import { StatePill } from '@/components/status-pill';
import { requireControlStaff } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';
import { formatCedi, getCollectionQueuesFor } from '@/lib/control-metrics';

export const dynamic = 'force-dynamic';

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readPreviewSize(value: string | string[] | undefined) {
  const rawValue = readSearchParam(value);
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 25) return 25;
  if (parsed <= 50) return 50;
  return 100;
}

function buildCollectionsHref(view: 'preview' | 'all', preview: number) {
  if (view === 'preview' && preview === 25) {
    return '/collections';
  }

  const params = new URLSearchParams();
  if (view === 'all') {
    params.set('view', 'all');
  }
  if (preview !== 25) {
    params.set('preview', String(preview));
  }

  return `/collections?${params.toString()}`;
}

function toPhoneHref(phone: string) {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : '#';
}

export default async function CollectionsPage({
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
  const view = readSearchParam(resolvedSearchParams.view) === 'all' ? 'all' : 'preview';
  const previewSize = readPreviewSize(resolvedSearchParams.preview);
  const businesses = await listManagedBusinesses();
  const queues = getCollectionQueuesFor(businesses);
  const queueEntries = [
    {
      key: 'healthy',
      title: 'Healthy accounts',
      description: 'No immediate collection pressure. Use these for relationship health and upsell review.',
      bestMove: 'Review relationship quality and confirm next commercial expansion move.',
      responseWindow: 'This week',
      items: queues.healthy,
    },
    {
      key: 'dueSoon',
      title: 'Due soon',
      description: 'Reminder queue before the account tips into overdue handling.',
      bestMove: 'Send reminder before the due date and confirm exact payment channel.',
      responseWindow: 'Within 24 hours',
      items: queues.dueSoon,
    },
    {
      key: 'overdue',
      title: 'Overdue but still operating',
      description: 'These businesses are in grace or fallback. Same-day follow-up matters here.',
      bestMove: 'Escalate same day and make the fallback or lock timeline explicit.',
      responseWindow: 'Same day',
      items: queues.overdue,
    },
    {
      key: 'locked',
      title: 'Locked or read-only',
      description: 'These accounts need payment confirmation or a deliberate commercial decision.',
      bestMove: 'Verify payment fast or decide whether the account should remain restricted.',
      responseWindow: 'Immediate',
      items: queues.locked,
    },
  ];
  const headerStats = [
    {
      label: 'Healthy accounts',
      value: String(queues.healthy.length),
      hint: 'Accounts that can shift to relationship quality and expansion review.',
    },
    {
      label: 'Due soon',
      value: String(queues.dueSoon.length),
      hint: 'Reminder queue to keep renewals proactive rather than reactive.',
    },
    {
      label: 'Overdue operating',
      value: String(queues.overdue.length),
      hint: 'Accounts still operating but already consuming collections attention.',
    },
    {
      label: 'Locked or read-only',
      value: String(queues.locked.length),
      hint: 'Accounts needing payment confirmation or a deliberate restriction decision.',
    },
  ];

  return (
    <div className="space-y-6">
      <ControlPageHeader
        eyebrow="Collections board"
        title="Run renewals in explicit queues, not one long list."
        description="The board is structured around operating urgency. Work reminders first, then same-day overdue follow-up, then locked recovery, while keeping healthy accounts available for relationship review."
        chips={queueEntries.map((queue) => ({ label: queue.title, href: `#${queue.key}` }))}
        stats={headerStats}
        aside={(
          <div className="space-y-5">
            <div>
              <div className="eyebrow">Pass order</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Work the queues in the right sequence</h2>
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
            <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4 text-sm leading-6 text-white/74">
              Preview mode stays the default so large portfolios remain fast on mobile and low-power devices.
            </div>
          </div>
        )}
      />

      <section className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-black/62">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildCollectionsHref('preview', previewSize)}
              className={`inline-flex rounded-full px-3 py-1.5 font-semibold ${view === 'preview' ? 'bg-[#122126] text-white' : 'border border-black/10 bg-white text-black/64'}`}
            >
              Preview mode
            </Link>
            <Link
              href={buildCollectionsHref('all', previewSize)}
              className={`inline-flex rounded-full px-3 py-1.5 font-semibold ${view === 'all' ? 'bg-[#1f8a82] text-white' : 'border border-black/10 bg-white text-black/64'}`}
            >
              Show all queues
            </Link>
          </div>

          <form action="/collections" className="flex flex-wrap items-center gap-2">
            {view === 'all' ? <input type="hidden" name="view" value="all" /> : null}
            <label className="text-sm">
              <span className="sr-only">Cards per queue</span>
              <select name="preview" defaultValue={String(previewSize)} className="control-field min-w-[150px]">
                <option value="25">Show 25 per queue</option>
                <option value="50">Show 50 per queue</option>
                <option value="100">Show 100 per queue</option>
              </select>
            </label>
            <button type="submit" className="inline-flex h-[50px] items-center justify-center rounded-2xl border border-black/10 bg-white px-5 text-sm font-semibold text-control-ink transition hover:bg-black/[0.03]">
              Update
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {queueEntries.map((queue) => {
          const visibleItems = view === 'all' ? queue.items : queue.items.slice(0, previewSize);
          const hiddenCount = Math.max(queue.items.length - visibleItems.length, 0);

          return (
          <div key={queue.key} id={queue.key} className="panel p-6">
            <SectionHeading eyebrow="Queue" title={queue.title} description={queue.description} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-black/62">
              <span>{queue.items.length} account{queue.items.length === 1 ? '' : 's'} in this queue.</span>
              {hiddenCount > 0 ? (
                <Link href={`${buildCollectionsHref('all', previewSize)}#${queue.key}`} className="font-semibold text-control-ink underline-offset-4 hover:underline">
                  Show all {queue.items.length}
                </Link>
              ) : null}
            </div>
            <div className="mt-4 rounded-[22px] border border-black/8 bg-black/[0.02] px-4 py-4 text-sm leading-6 text-black/64">
              <strong className="text-control-ink">Best move:</strong> {queue.bestMove} <span className="text-black/40">•</span> <strong className="text-control-ink">Response window:</strong> {queue.responseWindow}
            </div>
            <div className="mt-5 space-y-3">
              {visibleItems.map((business) => (
                <div key={business.id} className="rounded-2xl border border-black/8 bg-white/85 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-control-ink">{business.name}</div>
                      <div className="mt-1 text-xs text-black/55">{business.ownerName} · {business.ownerPhone}</div>
                    </div>
                    <StatePill state={business.state} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-black/64">
                    <span>Due: <strong className="text-control-ink">{business.nextDueAt}</strong></span>
                    <span>Outstanding: <strong className="text-control-ink">{formatCedi(business.outstandingAmount)}</strong></span>
                    <span>Manager: <strong className="text-control-ink">{business.assignedManager}</strong></span>
                  </div>
                  <div className="mt-3 rounded-2xl border border-black/8 bg-black/[0.02] px-3 py-3 text-sm leading-6 text-black/62">
                    Next operator move: {queue.bestMove}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={toPhoneHref(business.ownerPhone)}
                      className="inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-control-ink transition hover:bg-black/[0.03]"
                    >
                      Call owner
                    </a>
                    <Link
                      href={`/businesses/${business.id}`}
                      className="inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-control-ink transition hover:bg-black/[0.03]"
                    >
                      Open account
                    </Link>
                  </div>
                </div>
              ))}
              {visibleItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-black/12 bg-white/70 px-4 py-4 text-sm text-black/58">
                  No accounts are currently in this queue.
                </div>
              ) : null}
              {hiddenCount > 0 ? (
                <div className="rounded-2xl border border-dashed border-black/12 bg-white/70 px-4 py-4 text-sm text-black/58">
                  {hiddenCount} more account{hiddenCount === 1 ? '' : 's'} are hidden in preview mode to keep the board fast on large portfolios.
                </div>
              ) : null}
            </div>
          </div>
        );})}
      </section>
    </div>
  );
}