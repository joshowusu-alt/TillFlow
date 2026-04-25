import type { ManagedBusinessNote, ManagedBusinessPayment } from '@/lib/control-service';
import type { AuditLogEntry } from '@/lib/audit';
import { formatCedi } from '@/lib/control-metrics';

type TimelineKind = 'PAYMENT' | 'NOTE' | 'AUDIT';

type TimelineEntry = {
  id: string;
  kind: TimelineKind;
  at: Date;
  primary: string;
  secondary?: string;
  actor: string;
  category?: string;
  tone: 'positive' | 'neutral' | 'warning' | 'danger';
};

const KIND_LABEL: Record<TimelineKind, string> = {
  PAYMENT: 'Payment',
  NOTE: 'Note',
  AUDIT: 'Action',
};

const TONE_DOT: Record<TimelineEntry['tone'], string> = {
  positive: 'bg-emerald-500',
  neutral: 'bg-blue-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
};

const TONE_BORDER: Record<TimelineEntry['tone'], string> = {
  positive: 'border-emerald-200/80 bg-emerald-50/40',
  neutral: 'border-black/8 bg-white/95',
  warning: 'border-amber-200/80 bg-amber-50/40',
  danger: 'border-red-200/80 bg-red-50/40',
};

function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function paymentToEntry(payment: ManagedBusinessPayment): TimelineEntry {
  return {
    id: `payment-${payment.id}`,
    kind: 'PAYMENT',
    at: parseDate(payment.paidAt),
    primary: `${formatCedi(payment.amountPence)} via ${payment.method}`,
    secondary: payment.note ?? payment.reference ?? undefined,
    actor: payment.receivedBy,
    tone: 'positive',
  };
}

function noteToEntry(note: ManagedBusinessNote): TimelineEntry {
  return {
    id: `note-${note.id}`,
    kind: 'NOTE',
    at: parseDate(note.createdAt),
    primary: note.note,
    actor: note.createdBy,
    category: note.category,
    tone: note.category?.toUpperCase() === 'RISK' ? 'warning' : 'neutral',
  };
}

function auditToEntry(audit: AuditLogEntry): TimelineEntry {
  const tone: TimelineEntry['tone'] =
    audit.action === 'PAYMENT_RECORDED'
      ? 'positive'
      : audit.action === 'REVIEW_REOPENED'
      ? 'warning'
      : audit.action === 'SUBSCRIPTION_UPDATED'
      ? 'neutral'
      : 'neutral';
  return {
    id: `audit-${audit.id}`,
    kind: 'AUDIT',
    at: audit.createdAt,
    primary: audit.summary,
    actor: audit.staffEmail,
    category: audit.action.replace(/_/g, ' ').toLowerCase(),
    tone,
  };
}

function formatAt(date: Date) {
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dayLabel(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return target.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BusinessTimeline({
  payments,
  notes,
  audits,
}: {
  payments: ManagedBusinessPayment[];
  notes: ManagedBusinessNote[];
  audits: AuditLogEntry[];
}) {
  const entries: TimelineEntry[] = [
    ...payments.map(paymentToEntry),
    ...notes.map(noteToEntry),
    ...audits.map(auditToEntry),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  if (entries.length === 0) {
    return (
      <div className="panel p-6">
        <div className="rounded-2xl border border-dashed border-black/12 bg-white/70 px-4 py-6 text-center text-sm text-black/60">
          No activity recorded yet for this business.
          <br />
          The first review, payment, or note will appear here.
        </div>
      </div>
    );
  }

  // Group consecutive entries by day for mobile readability
  const groups: Array<{ label: string; items: TimelineEntry[] }> = [];
  for (const entry of entries) {
    const label = dayLabel(entry.at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(entry);
    } else {
      groups.push({ label, items: [entry] });
    }
  }

  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-4">
        <div className="eyebrow">Timeline</div>
        <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-control-ink sm:text-xl">
          Everything that has happened on this account
        </h2>
        <p className="mt-1 text-sm leading-6 text-black/58">
          Payments, notes, reviews, and operator actions in one chronological feed.
        </p>
      </div>

      <ol className="space-y-5">
        {groups.map((group, groupIdx) => (
          <li key={`${group.label}-${groupIdx}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/45">{group.label}</span>
              <span className="h-px flex-1 bg-black/10" aria-hidden="true" />
            </div>
            <ul className="space-y-2.5">
              {group.items.map((entry) => (
                <li key={entry.id} className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 sm:px-4 sm:py-3.5 ${TONE_BORDER[entry.tone]}`}>
                  <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${TONE_DOT[entry.tone]}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/48">
                      <span>{KIND_LABEL[entry.kind]}</span>
                      {entry.category ? <span className="text-black/35">· {entry.category}</span> : null}
                      <span className="ml-auto text-black/40">{formatAt(entry.at)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-control-ink">{entry.primary}</p>
                    {entry.secondary ? <p className="mt-1 text-xs leading-5 text-black/56">{entry.secondary}</p> : null}
                    <p className="mt-1.5 text-xs text-black/50">by {entry.actor}</p>
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
