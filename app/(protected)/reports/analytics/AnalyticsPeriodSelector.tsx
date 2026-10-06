'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const PERIOD_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;

export default function AnalyticsPeriodSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPeriod = searchParams?.get('period') || '7';

  const handlePeriodChange = (period: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('period', period);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={currentPeriod === opt.value}
          onClick={() => handlePeriodChange(opt.value)}
          className={`min-h-11 flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-none ${
            currentPeriod === opt.value
              ? 'bg-accent text-white shadow-sm'
              : 'bg-white text-ink ring-1 ring-slate-200 hover:bg-slate-100'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
