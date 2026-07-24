'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Home retry control. `tone="onDark"` is required on the hero gradient card —
 * the default (light-surface) tone is unreadable there, which previously made
 * retry effectively invisible on "Could not load today's figures".
 */
function RetryButton({
  label = 'Try again',
  tone = 'light',
}: {
  label?: string;
  tone?: 'light' | 'onDark';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toneClasses =
    tone === 'onDark'
      ? 'border-white/40 bg-white/15 text-white hover:bg-white/25 focus-visible:outline-white'
      : 'border-black/10 bg-white text-accent hover:bg-accentSoft focus-visible:outline-accent';

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      aria-label={pending ? 'Retrying…' : `${label} — reload this section`}
      className={`mt-2.5 inline-flex min-h-8 items-center gap-1.5 self-start rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${toneClasses}`}
    >
      {pending ? (
        <>
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Refreshing…
        </>
      ) : (
        label
      )}
    </button>
  );
}

/** KPI hero unavailable — never shows GH₵0 / zero tx as verified values. */
export function HomePerformanceUnavailable() {
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3"
      role="alert"
      aria-live="polite"
    >
      <div className="col-span-2 flex min-h-[4.5rem] flex-col justify-center rounded-2xl border border-white/15 bg-white/8 px-3 py-2.5 sm:col-span-3 sm:min-h-[6.5rem] sm:px-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-blue-100/80">
          Today&apos;s performance
        </p>
        <p className="mt-1 text-sm font-semibold text-white">Could not load today&apos;s figures</p>
        <p className="mt-0.5 text-[11px] text-blue-100/70">
          Open POS still works. Pull to refresh or try again.
        </p>
        <RetryButton tone="onDark" />
      </div>
    </div>
  );
}

export function HomeStatusUnavailable() {
  return (
    <div
      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-blue-100/80"
      role="status"
      aria-live="polite"
    >
      Status unavailable
    </div>
  );
}

export function HomeAttentionUnavailable() {
  return (
    <section aria-labelledby="todays-attention-heading" role="alert" aria-live="polite">
      <div className="mb-3">
        <h2 id="todays-attention-heading" className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/35">
          Today&apos;s attention
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted">Attention items could not be loaded.</p>
      </div>
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50 px-3.5 py-3">
        <p className="text-sm font-semibold text-ink">We could not check today&apos;s attention items</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Do not assume the till is clear. Use Command Center from the menu if you need to review issues.
        </p>
        <RetryButton />
      </div>
    </section>
  );
}

export function HomeImproveRecordsUnavailable() {
  return (
    <section
      aria-labelledby="improve-your-records-heading"
      className="rounded-2xl border border-black/8 bg-white p-4 sm:p-5"
      role="alert"
      aria-live="polite"
    >
      <h2 id="improve-your-records-heading" className="text-sm font-bold text-ink">
        Improve your records
      </h2>
      <p className="mt-1 text-xs leading-5 text-muted">Record improvements could not be loaded.</p>
      <p className="mt-3 text-sm leading-5 text-muted">
        Selling is unaffected. Try again after a moment.
      </p>
      <RetryButton />
    </section>
  );
}

export function HomeExtrasUnavailable() {
  return (
    <div
      className="rounded-xl border border-black/[0.06] bg-white px-3.5 py-3 text-xs text-muted shadow-sm"
      role="status"
      aria-live="polite"
    >
      Extra home details could not be loaded.
      <RetryButton />
    </div>
  );
}

export function HomeLastCloseUnavailable() {
  return <p className="mt-0.5 text-[11px] text-blue-100/50">Last close unavailable</p>;
}
