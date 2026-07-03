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
    <div className="flex items-center gap-1.5 sm:gap-2">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => handlePeriodChange(opt.value)}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all sm:flex-none sm:text-sm ${
            currentPeriod === opt.value
              ? 'bg-accent text-white shadow-sm'
              : 'bg-black/5 text-black/60 hover:bg-black/10'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
