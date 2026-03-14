'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  markNotificationSentAction,
  retryNotificationAction,
} from '@/app/actions/notifications';

type MessageLogActionsProps = {
  messageLogId: string;
  status: string;
  providerStatus: string | null;
  deepLink: string | null;
  deliveredAt: string | null;
};

type ActionFeedback =
  | {
      tone: 'success' | 'warn' | 'danger';
      message: string;
    }
  | null;

function hasReviewProviderStatus(providerStatus: string | null) {
  return !!providerStatus && providerStatus.toUpperCase().includes('REVIEW');
}

export default function MessageLogActions({
  messageLogId,
  status,
  providerStatus,
  deepLink,
  deliveredAt,
}: MessageLogActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ActionFeedback>(null);

  const canRetry = status === 'FAILED' || status === 'REVIEW_REQUIRED' || hasReviewProviderStatus(providerStatus);
  const hasConfirmedDelivery = !!deliveredAt || status === 'DELIVERED' || status === 'READ';
  const canMarkSent = !!deepLink && !hasConfirmedDelivery;

  if (!canRetry && !canMarkSent) {
    return null;
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {canRetry ? (
          <button
            type="button"
            className="btn-secondary px-3 py-2 text-xs"
            disabled={isPending}
            onClick={() => {
              setFeedback(null);
              startTransition(async () => {
                const result = await retryNotificationAction(messageLogId);
                setFeedback(
                  result.ok
                    ? {
                        tone: 'success',
                        message: `Retry sent. Current status: ${(result.status ?? 'ACCEPTED').replace(/_/g, ' ')}.`,
                      }
                    : result.status === 'REVIEW_REQUIRED'
                      ? {
                          tone: 'warn',
                          message: result.error ?? 'Retry needs manual review.',
                        }
                      : {
                          tone: 'danger',
                          message: result.error ?? 'Retry failed.',
                        }
                );
                router.refresh();
              });
            }}
          >
            {isPending ? 'Working...' : 'Retry'}
          </button>
        ) : null}

        {canMarkSent ? (
          <button
            type="button"
            className="btn-ghost px-3 py-2 text-xs"
            disabled={isPending}
            onClick={() => {
              setFeedback(null);
              startTransition(async () => {
                const result = await markNotificationSentAction(messageLogId);
                setFeedback(
                  result.ok
                    ? {
                        tone: 'success',
                        message: 'Marked as delivered.',
                      }
                    : {
                        tone: 'danger',
                        message: result.error ?? 'Unable to mark this message as delivered.',
                      }
                );
                router.refresh();
              });
            }}
          >
            {isPending ? 'Working...' : 'Mark as Sent'}
          </button>
        ) : null}
      </div>

      {feedback ? (
        <div
          className={`rounded-lg border px-3 py-2 text-[11px] ${
            feedback.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : feedback.tone === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}
    </div>
  );
}
