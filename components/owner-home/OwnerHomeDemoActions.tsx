'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearSampleData, generateDemoDay } from '@/app/actions/demo-day';
import { useToast } from '@/components/ToastProvider';
import { HomeIcon } from '@/components/owner-home/home-chrome';

const CheckIcon = () => (
  <svg className="h-5 w-5 text-success" viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
      clipRule="evenodd"
    />
  </svg>
);

function DemoDaySection({
  hasDemoData,
  hasSeedData,
  onGenerate,
  onWipe,
  isPending,
}: {
  hasDemoData: boolean;
  hasSeedData: boolean;
  onGenerate: () => void;
  onWipe: () => void;
  isPending: boolean;
}) {
  const hasAnyDemoContent = hasDemoData || hasSeedData;
  return (
    <div id="demo" className="rounded-2xl border border-accent/10 bg-gradient-to-br from-accentSoft/60 via-white to-accentSoft/40 p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <HomeIcon name="play" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-ink">Live preview mode</h3>
          <p className="text-xs text-muted">Explore every chart and report with a week of realistic trading activity</p>
        </div>
      </div>

      {hasAnyDemoContent ? (
        <div className="space-y-3">
          {hasDemoData ? (
            <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2">
              <CheckIcon />
              <span className="text-sm font-medium text-success">
                Preview data loaded — explore freely. Your real setup is unaffected.
              </span>
            </div>
          ) : null}
          {hasSeedData && !hasDemoData ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <svg className="h-4 w-4 flex-shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
                />
              </svg>
              <span className="text-sm font-medium text-amber-800">
                Sample products are loaded. Remove them when you&apos;re ready to start fresh.
              </span>
            </div>
          ) : null}
          {hasDemoData ? (
            <Link
              href="/reports/dashboard"
              className="btn-ghost inline-flex min-h-11 w-full items-center justify-center border border-black/10 py-2 text-center text-sm"
            >
              Explore sample data
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onWipe}
            disabled={isPending}
            className="w-full py-1.5 text-xs text-rose transition hover:text-rose/80 disabled:opacity-50"
          >
            {isPending ? 'Clearing...' : 'Clear all sample & demo data'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-1.5">
            {['~30 sales across 7 days', 'Realistic expenses & margins', 'Reports & dashboards come alive'].map((t) => (
              <li key={t} className="flex items-center gap-2 text-xs text-muted">
                <span className="h-1 w-1 rounded-full bg-accent/40" />
                {t}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onGenerate}
            disabled={isPending}
            className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm shadow-lg shadow-accent/10 disabled:opacity-50"
          >
            {isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Loading preview data...
              </>
            ) : (
              <>
                <HomeIcon name="play" />
                <span>Load preview data</span>
              </>
            )}
          </button>
          <p className="text-center text-[10px] text-muted">Removed with one click — your real setup is never affected</p>
        </div>
      )}
    </div>
  );
}

function EstablishedSampleNotice({
  hasDemoData,
  hasSeedData,
  onWipe,
  isPending,
}: {
  hasDemoData: boolean;
  hasSeedData: boolean;
  onWipe: () => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3.5 py-3">
      <p className="text-sm font-medium text-ink">
        {hasDemoData ? 'Sample trading data is still on this account.' : 'Sample products are still on this account.'}
      </p>
      <p className="mt-1 text-xs text-muted">
        {hasSeedData && !hasDemoData
          ? 'Remove them when you are ready to keep only your real catalogue.'
          : 'Clear them when you no longer need the preview activity.'}
      </p>
      <button
        type="button"
        onClick={onWipe}
        disabled={isPending}
        className="mt-2 text-xs font-semibold text-rose hover:text-rose/80 disabled:opacity-50"
      >
        {isPending ? 'Clearing…' : 'Clear sample & demo data'}
      </button>
    </div>
  );
}

export default function OwnerHomeDemoActions({
  hasDemoData,
  hasSeedData,
  isNewAccount,
}: {
  hasDemoData: boolean;
  hasSeedData: boolean;
  isNewAccount: boolean;
}) {
  const router = useRouter();
  const { toast: showToast } = useToast();
  const [isBusy, setIsBusy] = useState(false);

  const handleGenerate = async () => {
    setIsBusy(true);
    try {
      const res = await generateDemoDay();
      if (res.ok && res.salesCount > 0) {
        showToast(`${res.salesCount} sample sales added for practice`, 'success');
      } else if (res.error) {
        showToast(res.error, 'error');
      }
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  };

  const handleWipe = async () => {
    setIsBusy(true);
    try {
      const res = await clearSampleData();
      if (res.ok) {
        showToast(
          res.removed.length > 0 ? `Cleared: ${res.removed.join(', ')}` : 'Sample data removed',
          'success'
        );
      } else if (res.error) {
        showToast(res.error, 'error');
      }
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  };

  if (isNewAccount) {
    return (
      <DemoDaySection
        hasDemoData={hasDemoData}
        hasSeedData={hasSeedData}
        onGenerate={handleGenerate}
        onWipe={handleWipe}
        isPending={isBusy}
      />
    );
  }

  if (hasDemoData || hasSeedData) {
    return (
      <EstablishedSampleNotice
        hasDemoData={hasDemoData}
        hasSeedData={hasSeedData}
        onWipe={handleWipe}
        isPending={isBusy}
      />
    );
  }

  return null;
}
