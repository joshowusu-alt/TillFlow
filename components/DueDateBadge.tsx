import { formatDate } from '@/lib/format';
import { getDueDateStatus } from '@/lib/due-date-status';

type Props = {
  dueDate?: Date | null;
  now?: Date;
  isClosed?: boolean;
  noneLabel?: string;
  showOverduePrefix?: boolean;
};

export default function DueDateBadge({
  dueDate,
  now = new Date(),
  isClosed = false,
  noneLabel = '—',
  showOverduePrefix = true,
}: Props) {
  if (!dueDate) {
    return <span className="text-black/30">{noneLabel}</span>;
  }

  const status = getDueDateStatus(dueDate, now, { isClosed });

  const classes =
    status.state === 'OVERDUE'
      ? 'bg-red-100 text-red-700'
      : status.state === 'DUE_SOON'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-black/5 text-black/60';

  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      {status.state === 'OVERDUE' && showOverduePrefix ? 'Overdue · ' : ''}
      {formatDate(dueDate)}
    </span>
  );
}
