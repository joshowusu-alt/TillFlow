'use client';

import { useFormStatus } from 'react-dom';

function BulkRemindSubmit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(`Queue SMS reminders for all ${count} due-soon account${count === 1 ? '' : 's'}?`)) {
          e.preventDefault();
        }
      }}
      className="inline-flex items-center justify-center rounded-full border border-control-teal/30 bg-control-teal/8 px-3 py-1 text-xs font-semibold text-control-teal transition hover:bg-control-teal/16 disabled:opacity-60"
    >
      {pending ? 'Queuing…' : `Remind all ${count}`}
    </button>
  );
}

export default function BulkRemindButton({ count, action }: { count: number; action: () => Promise<void> }) {
  return (
    <form action={action}>
      <BulkRemindSubmit count={count} />
    </form>
  );
}
