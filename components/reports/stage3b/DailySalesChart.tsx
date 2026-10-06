'use client';

import { useState } from 'react';
import FinancialAmount from '@/components/reports/FinancialAmount';
import { formatMoney } from '@/lib/format';
import { REPORT_FOCUS } from './ReportPrimitives';

export default function DailySalesChart({ labels, values, currency }: { labels: string[]; values: number[]; currency: string }) {
  const [selected, setSelected] = useState(Math.max(0, labels.length - 1));
  const max = Math.max(...values.map(Math.abs), 0);
  if (!labels.length || max === 0) return <p className="py-8 text-sm text-slate-600">No sales value in the displayed dates.</p>;
  const index = Math.min(selected, labels.length - 1);
  return <div>
    <div className="mb-3 flex min-w-0 flex-wrap items-baseline justify-between gap-2 text-sm text-ink" aria-live="polite">
      <span className="font-semibold">{labels[index]}</span><div className="financial-fit w-full"><FinancialAmount pence={values[index] ?? 0} currency={currency} className="!text-base" /></div>
    </div>
    <div className="overflow-x-auto pb-2" role="group" aria-label="Daily sales bars">
      <div className="flex h-52 gap-2" style={{ minWidth: `${labels.length * 48}px` }}>
        {labels.map((label, i) => <button key={`${label}-${i}`} type="button" aria-pressed={i === index}
          aria-label={`${label}: ${formatMoney(values[i] ?? 0, currency)}`}
          onClick={() => setSelected(i)} className={`flex min-w-11 flex-1 flex-col justify-end gap-2 px-1 pt-2 ${REPORT_FOCUS}`}>
          <span aria-hidden="true" className={`mx-auto w-full max-w-12 rounded-t-lg ${values[i] < 0 ? 'bg-amber-700' : i === index ? 'bg-sky-700' : 'bg-accent'}`} style={{ height: `${Math.abs(values[i] ?? 0) / max * 160}px` }} />
          <span className="min-h-8 text-xs leading-4 text-slate-600">{label}</span>
        </button>)}
      </div>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-600">Tap a bar for its exact amount. Sales today are still in progress. Earlier dates show full calendar days.</p>
  </div>;
}
