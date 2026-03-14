'use client';

import { useState, useTransition } from 'react';

import { sendEodSummaryAction } from '@/app/actions/notifications';

type SendState =
  | {
      tone: 'success' | 'warn' | 'danger';
      buttonLabel: string;
      message: string;
    }
  | null;

function formatStatus(status: string | null | undefined) {
  return (status ?? 'UNKNOWN').replace(/_/g, ' ').toLowerCase();
}

export default function SendTestSummaryButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SendState>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="btn-secondary text-center sm:min-w-[12rem]"
        disabled={isPending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            try {
              const response = await sendEodSummaryAction();

              if (response?.status === 'REVIEW_REQUIRED') {
                setResult({
                  tone: 'warn',
                  buttonLabel: '⚠ Manual review required',
                  message:
                    response.error ??
                    `TillFlow generated the summary, but delivery is waiting on manual review (${formatStatus(response.provider)} / ${formatStatus(response.status)}).`,
                });
                return;
              }

              if (response?.ok) {
                setResult({
                  tone: 'success',
                  buttonLabel: '✓ Sent successfully',
                  message: `Summary sent via ${formatStatus(response.provider)}. Current delivery status: ${formatStatus(response.status)}.`,
                });
                return;
              }

              setResult({
                tone: 'danger',
                buttonLabel: '✗ Failed',
                message: response?.error ?? 'Unable to send the test summary right now.',
              });
            } catch (error) {
              setResult({
                tone: 'danger',
                buttonLabel: '✗ Failed',
                message: error instanceof Error ? error.message : 'Unable to send the test summary right now.',
              });
            }
          });
        }}
      >
        {isPending ? 'Sending...' : result?.buttonLabel ?? 'Send Test Summary'}
      </button>

      {result ? (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            result.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : result.tone === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {result.message}
        </div>
      ) : null}
    </div>
  );
}
