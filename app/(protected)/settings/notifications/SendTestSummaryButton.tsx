'use client';

import { useState, useTransition } from 'react';

import { sendEodSummaryAction } from '@/app/actions/notifications';

type SendState =
  | {
      tone: 'success' | 'warn' | 'neutral';
      buttonLabel: string;
      message: string;
    }
  | null;

type SendTestSummaryButtonProps = {
  whatsappAutomationConnected: boolean;
};

export default function SendTestSummaryButton({
  whatsappAutomationConnected,
}: SendTestSummaryButtonProps) {
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
                  buttonLabel: 'Needs follow-up',
                  message:
                    response.error ??
                    'Your summary is ready. Open it in WhatsApp below or from recent delivery history to send it manually.',
                });
                return;
              }

              if (response?.ok) {
                setResult({
                  tone: 'success',
                  buttonLabel: 'Summary sent',
                  message: whatsappAutomationConnected
                    ? 'Your test summary was sent.'
                    : 'Your test summary was sent by SMS where available, or is ready for WhatsApp manual follow-up.',
                });
                return;
              }

              if (response?.reason === 'disabled') {
                setResult({
                  tone: 'neutral',
                  buttonLabel: 'Send Test Summary',
                  message: 'Enable Daily Owner Summary and save an owner phone number before sending a test.',
                });
                return;
              }

              if (response?.reason === 'missing_recipient') {
                setResult({
                  tone: 'neutral',
                  buttonLabel: 'Send Test Summary',
                  message: 'Add a valid owner phone number, save settings, then try again.',
                });
                return;
              }

              setResult({
                tone: 'warn',
                buttonLabel: 'Needs follow-up',
                message: response?.error ?? 'Your summary may need manual follow-up in WhatsApp.',
              });
            } catch (error) {
              setResult({
                tone: 'warn',
                buttonLabel: 'Send Test Summary',
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
                : 'border-black/10 bg-black/[0.03] text-black/65'
          }`}
        >
          {result.message}
        </div>
      ) : null}
    </div>
  );
}
