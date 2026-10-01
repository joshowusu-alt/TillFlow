'use client';

import { useState } from 'react';
import { ReportsReturnPath } from '@/components/reports/ReportsContextNav';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import { reviewScopeLabel } from '@/lib/reports/today/review-samples';
import { returnPathFor } from '@/lib/reports/today/stage3a-nav';

const WIDTHS = {
  '320': 320,
  '390': 390,
  laptop: 1180,
  large: 1440,
} as const;

type Viewport = keyof typeof WIDTHS;

const DESTINATIONS = {
  trading: {
    pathname: '/reports/dashboard',
    title: 'Trading',
    note: 'Sample report body — filters and legacy dashboard content are unchanged in this review frame.',
  },
  'sales-analytics': {
    pathname: '/reports/analytics',
    title: 'Sales analytics',
    note: 'Sample report body — charts and period controls are not loaded on this review surface.',
  },
  'business-movement': {
    pathname: '/reports/business-movement',
    title: 'Business movement',
    note: 'Sample report body — movement tables are not loaded on this review surface.',
  },
} as const;

type Destination = keyof typeof DESTINATIONS;

export default function Stage3aContextReview() {
  const [viewport, setViewport] = useState<Viewport>('390');
  const [destination, setDestination] = useState<Destination>('trading');
  const scopeLabel = reviewScopeLabel('GROWTH', false);
  const dest = DESTINATIONS[destination];
  const path = returnPathFor(dest.pathname);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="note">
        <p className="font-semibold">Review controls — not part of the customer screen</p>
        <p className="mt-1">Synthetic destination context only. No live data, exports, or mutations.</p>
      </div>
      <form
        className="grid gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:grid-cols-2"
        aria-label="Review controls"
        onSubmit={(event) => event.preventDefault()}
      >
        <Field label="Width" value={viewport} onChange={(value) => setViewport(value as Viewport)} options={['320', '390', 'laptop', 'large']} />
        <Field
          label="Destination"
          value={destination}
          onChange={(value) => setDestination(value as Destination)}
          options={['trading', 'sales-analytics', 'business-movement']}
        />
      </form>
      <div className="overflow-x-auto p-4">
        <div
          className="mx-auto overflow-x-hidden rounded-2xl border border-slate-300 bg-[#F8FAFC] px-4 py-4 shadow-card"
          style={{ width: WIDTHS[viewport] }}
          data-review-frame={viewport}
        >
          <div className="mb-3 border-b border-slate-200 pb-2 text-xs font-semibold text-slate-500">
            Sample destination · {WIDTHS[viewport]}px · {dest.title}
          </div>
          {path ? <ReportsReturnPath path={path} storeId="sample-branch" /> : null}
          <ReportsDestinationHead
            title={dest.title}
            scopeLabel={scopeLabel}
          />
          <p className="mt-4 text-sm leading-6 text-slate-600">{dest.note}</p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const id = `review-context-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label className="block text-xs font-semibold text-slate-600" htmlFor={id}>
      {label}
      <select id={id} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-ink" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
