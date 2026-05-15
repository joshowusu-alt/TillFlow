'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const MESSAGES: Record<string, { text: string; tone: 'success' | 'warning' | 'info' }> = {
  subscription: { text: 'Subscription saved and mirrored into Tillflow billing fields.', tone: 'success' },
  payment: { text: 'Payment recorded. Tillflow entitlement fields updated — access restored immediately.', tone: 'success' },
  note: { text: 'Internal note saved to the control plane.', tone: 'success' },
  reminder: { text: 'Subscription SMS reminder queued for resend.', tone: 'info' },
  review: { text: 'Business review saved. Account removed from the unreviewed queue.', tone: 'success' },
  reopened: { text: 'Business returned to the review queue.', tone: 'warning' },
  assigned: { text: 'Manager assignment saved.', tone: 'success' },
  staff: { text: 'Staff record saved.', tone: 'success' },
  plan: { text: 'Plan updated and mirrored into Tillflow.', tone: 'success' },
  bulk: { text: 'Bulk action completed across selected accounts.', tone: 'success' },
};

const TONE_CLASSES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
};

export default function Toast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<{ text: string; tone: 'success' | 'warning' | 'info' } | null>(null);

  useEffect(() => {
    const updated = searchParams.get('updated');
    const error = searchParams.get('toast_error');

    if (updated && MESSAGES[updated]) {
      setConfig(MESSAGES[updated]);
      setVisible(true);

      const url = new URL(window.location.href);
      url.searchParams.delete('updated');
      router.replace(url.pathname + (url.search || ''), { scroll: false });

      const timer = setTimeout(() => setVisible(false), 4500);
      return () => clearTimeout(timer);
    }

    if (error) {
      setConfig({ text: decodeURIComponent(error), tone: 'warning' });
      setVisible(true);

      const url = new URL(window.location.href);
      url.searchParams.delete('toast_error');
      router.replace(url.pathname + (url.search || ''), { scroll: false });

      const timer = setTimeout(() => setVisible(false), 5500);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router]);

  if (!visible || !config) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-[calc(var(--safe-bottom)+1.25rem)] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 rounded-2xl border px-4 py-3.5 text-sm font-medium shadow-raised transition-all ${TONE_CLASSES[config.tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="leading-6">{config.text}</span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setVisible(false)}
          className="mt-0.5 shrink-0 opacity-60 transition hover:opacity-100"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>
    </div>
  );
}
