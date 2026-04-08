import SectionHeading from '@/components/section-heading';
import { StatePill } from '@/components/status-pill';
import { requireControlStaff } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';
import { formatCedi, getCollectionQueuesFor } from '@/lib/control-metrics';

export default async function CollectionsPage() {
  await requireControlStaff();
  const businesses = await listManagedBusinesses();
  const queues = getCollectionQueuesFor(businesses);
  const queueEntries = [
    {
      key: 'healthy',
      title: 'Healthy accounts',
      description: 'No immediate collection pressure. Use these for relationship health and upsell review.',
      items: queues.healthy,
    },
    {
      key: 'dueSoon',
      title: 'Due soon',
      description: 'Reminder queue before the account tips into overdue handling.',
      items: queues.dueSoon,
    },
    {
      key: 'overdue',
      title: 'Overdue but still operating',
      description: 'These businesses are in grace or fallback. Same-day follow-up matters here.',
      items: queues.overdue,
    },
    {
      key: 'locked',
      title: 'Locked or read-only',
      description: 'These accounts need payment confirmation or a deliberate commercial decision.',
      items: queues.locked,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <SectionHeading
          eyebrow="Collections board"
          title="Run renewals in explicit queues"
          description="Tishgroup should not work one long list. Work the portfolio by queue so due, overdue, fallback, and locked businesses each get the right operating response."
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {queueEntries.map((queue) => (
          <div key={queue.key} className="panel p-6">
            <SectionHeading eyebrow="Queue" title={queue.title} description={queue.description} />
            <div className="mt-5 space-y-3">
              {queue.items.map((business) => (
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
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}