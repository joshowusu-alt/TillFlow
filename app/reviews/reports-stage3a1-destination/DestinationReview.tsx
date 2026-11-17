'use client';

import { useLayoutEffect, useState } from 'react';
import { ReportsReturnPath } from '@/components/reports/ReportsContextNav';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import { DestinationShell } from '@/components/reports/presentation/DestinationShell';
import { AnalyticsResult, MovementResult, TradingResult, TradingWelcome } from '@/app/reviews/reports-presentation/DestinationBodies';
import { ownerPeriodLabels } from '@/lib/reports/business-movement/owner-copy';
import { resolveLastFullCalendarMonthPair } from '@/lib/reports/business-movement/periods';
import { reviewScopeLabel } from '@/lib/reports/today/review-samples';
import { returnPathFor, type ReportReturnPath } from '@/lib/reports/today/stage3a-nav';
import {
  CustomerScreen,
  ShellBottomNav,
  stayOnReview,
} from '@/app/reviews/reports-presentation/CustomerScreen';
import { formatGeometry, measureCustomerScreens } from '@/app/reviews/reports-presentation/geometry';

const REVIEW_DAY = new Date('2026-10-01T12:00:00Z');
const UPDATED = '14:10';

type Destination = 'trading' | 'sales-analytics' | 'business-movement';
type View = 'current' | 'proposed' | 'both';

const PATHS = {
  trading: '/reports/dashboard',
  'sales-analytics': '/reports/analytics',
  'business-movement': '/reports/business-movement',
} as const;

export default function DestinationReview() {
  const [destination, setDestination] = useState<Destination>('trading');
  const [view, setView] = useState<View>('proposed');
  const [banner, setBanner] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [geometry, setGeometry] = useState('');
  const path = returnPathFor(PATHS[destination]);
  const scopeLabel = reviewScopeLabel('GROWTH', false);
  const movement = ownerPeriodLabels(resolveLastFullCalendarMonthPair({ timeZone: 'GMT', asOf: REVIEW_DAY }));
  const periodLabel = destination === 'trading'
    ? '7-day default · GMT'
    : destination === 'sales-analytics'
      ? '7 days · GMT'
      : movement.comparingLine;

  useLayoutEffect(() => {
    const publish = () => setGeometry(formatGeometry(measureCustomerScreens()));
    publish();
    window.addEventListener('resize', publish);
    return () => window.removeEventListener('resize', publish);
  }, [destination, view, banner, controlsOpen]);

  if (!path || 'withheld' in path) return null;

  return (
    <div className="min-h-screen bg-slate-100">
      {controlsOpen ? (
        <div data-review-controls="" className="border-b border-amber-300 bg-amber-50">
          <div className="flex items-start justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-amber-950">Review controls — not part of the customer screen</p>
              <p className="mt-1 max-w-[65ch] text-sm text-amber-950">
                Sample card position only. Amounts are the Today sample, except Sales Analytics revenue, which uses the long-money layout fixture so the existing truncation can be seen. Nothing here calculates a destination report.
              </p>
            </div>
            <button type="button" className="min-h-11 shrink-0 rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold" onClick={() => setControlsOpen(false)}>
              Hide controls
            </button>
          </div>
          <form className="grid grid-cols-2 gap-2 px-4 pb-3 sm:grid-cols-3" aria-label="Review controls" onSubmit={(event) => event.preventDefault()}>
            <Field label="Destination" value={destination} onChange={(value) => setDestination(value as Destination)} options={['trading', 'sales-analytics', 'business-movement']} />
            <Field label="View" value={view} onChange={(value) => setView(value as View)} options={['current', 'proposed', 'both']} />
            <Field label="Banner" value={banner ? 'compact' : 'none'} onChange={(value) => setBanner(value === 'compact')} options={['none', 'compact']} />
          </form>
          <pre data-geometry="" className="max-w-full whitespace-pre-wrap px-4 pb-3 text-xs leading-5 text-amber-950">{geometry}</pre>
        </div>
      ) : (
        <div data-review-controls="" className="border-b border-amber-300 bg-amber-50 px-4 py-2">
          <button type="button" className="min-h-11 text-sm font-semibold text-amber-950" onClick={() => setControlsOpen(true)}>
            Show review controls — not part of the customer screen
          </button>
        </div>
      )}

      {view !== 'proposed' ? (
        <CustomerScreen label={`current-${destination}`} banner={banner}>
          <CurrentDestination path={path} scopeLabel={scopeLabel} periodLabel={periodLabel} movementLine={movement.comparingLine} />
        </CustomerScreen>
      ) : null}
      {view !== 'current' ? (
        <CustomerScreen label={`proposed-${destination}`} banner={banner}>
          <DestinationShell
            path={path}
            storeId="sample-branch"
            scopeLabel={scopeLabel}
            periodLabel={periodLabel}
            updatedLabel={UPDATED}
            integrityTitle={destination === 'business-movement' ? 'Period and how to read this' : 'Period and how this report is read'}
            integrity={<Integrity destination={destination} />}
            onStay={stayOnReview}
          >
            <DestinationResult destination={destination} />
          </DestinationShell>
        </CustomerScreen>
      ) : null}
      <ShellBottomNav />
    </div>
  );
}

function CurrentDestination({
  path,
  scopeLabel,
  periodLabel,
  movementLine,
}: {
  path: ReportReturnPath;
  scopeLabel: string;
  periodLabel: string;
  movementLine: string;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <ReportsReturnPath path={path} storeId="sample-branch" />
      <ReportsDestinationHead title={path.title} scopeLabel={scopeLabel} />
      {path.href === '/reports/dashboard' ? <CurrentTrading periodLabel={periodLabel} /> : null}
      {path.href === '/reports/analytics' ? <CurrentAnalytics periodLabel={periodLabel} /> : null}
      {path.href === '/reports/business-movement' ? <CurrentMovement movementLine={movementLine} /> : null}
      {path.href === '/reports/dashboard' ? <TradingWelcome /> : null}
      <DestinationResult
        destination={path.href === '/reports/analytics' ? 'sales-analytics' : path.href === '/reports/business-movement' ? 'business-movement' : 'trading'}
        truncateMoney
      />
    </div>
  );
}

function CurrentTrading({ periodLabel }: { periodLabel: string }) {
  return (
    <>
      <p className="text-sm text-muted">{periodLabel}</p>
      <details open>
        <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink">
          Adjust date range / branch
        </summary>
        <div className="mt-2 space-y-2">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
            <p>
              <strong>Sales revenue</strong> is recognised sales for this period.
              <strong> Money received</strong> is payment receipts (including later credit collections).
              They can differ when customers buy on credit or pay old balances.
            </p>
            <p className="mt-1">Period uses the business timezone (GMT). Customer and supplier balances show the current position, not only this period.</p>
          </div>
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <label className="text-sm text-ink">From<input className="input mt-1 w-full" readOnly value="" aria-label="From" /></label>
            <label className="text-sm text-ink">To<input className="input mt-1 w-full" readOnly value="" aria-label="To" /></label>
            <button type="button" className="btn-primary min-h-11 sm:col-span-2">Apply filters</button>
          </div>
        </div>
      </details>
    </>
  );
}

function CurrentAnalytics({ periodLabel }: { periodLabel: string }) {
  return (
    <>
      <p className="text-xs text-black/45">
        Profit uses stored sale-line discounts and cost. Incomplete costs are shown instead of a firm gross profit.
      </p>
      <div className="flex flex-wrap gap-2" aria-label="Current period control">
        {['7 days', '14 days', '30 days', '90 days'].map((label) => (
          <span key={label} className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm ${label === '7 days' ? 'bg-accent text-white' : 'bg-black/5 text-black/60'}`}>
            {label === '7 days' ? periodLabel.replace(' · GMT', '') : label}
          </span>
        ))}
      </div>
    </>
  );
}

function CurrentMovement({ movementLine }: { movementLine: string }) {
  return (
    <>
      <p className="text-sm text-muted">
        See how sales, confirmed payments, refunds and Mobile Money waiting for confirmation changed between two equal periods.
      </p>
      <section className="max-w-3xl space-y-2 text-sm leading-6 text-slate-700">
        <h2 className="text-base font-semibold text-slate-900">How to read this</h2>
        <p>This compares two equal periods. The totals below are what changed. The notes under them say why that change showed up.</p>
        <p>Sales, confirmed payments, refunds and Mobile Money waiting for confirmation are operational figures for the selected period. They are not the income statement. This report does not calculate purchases, expenses, or customer and supplier balances.</p>
      </section>
      <p className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-800">{movementLine}</p>
    </>
  );
}

function Integrity({ destination }: { destination: Destination }) {
  if (destination === 'trading') {
    return (
      <>
        <p>Sales revenue is recognised sales for this period. Money received is payment receipts, including later credit collections. They can differ when customers buy on credit or pay old balances.</p>
        <p>Period uses the business timezone. Customer and supplier balances show the current position, not only this period.</p>
        <p>The date range and branch filter stay here, closed until you ask for them.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-ink">From<input className="input mt-1 w-full" readOnly value="2026-09-24" aria-label="From" /></label>
          <label className="text-sm text-ink">To<input className="input mt-1 w-full" readOnly value="2026-09-30" aria-label="To" /></label>
          <button type="button" className="btn-primary min-h-11 sm:col-span-2">Apply filters</button>
        </div>
      </>
    );
  }
  if (destination === 'sales-analytics') {
    return (
      <>
        <p>Profit uses stored sale-line discounts and cost. Incomplete costs are shown instead of a firm gross profit.</p>
      </>
    );
  }
  return (
    <>
      <p>This compares two equal periods. The totals in the report are what changed. The notes under them say why that change showed up.</p>
      <p>Sales, confirmed payments, refunds and Mobile Money waiting for confirmation are operational figures for the selected period. They are not the income statement. This report does not calculate purchases, expenses, or customer and supplier balances.</p>
    </>
  );
}

function DestinationResult({ destination, truncateMoney = false }: { destination: Destination; truncateMoney?: boolean }) {
  if (destination === 'sales-analytics') {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" aria-label="Period">
          {['7 days', '14 days', '30 days', '90 days'].map((label) => (
            <button key={label} type="button" aria-pressed={label === '7 days'} className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ${label === '7 days' ? 'bg-accent text-white' : 'bg-slate-100 text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
        <AnalyticsResult truncateMoney={truncateMoney} />
      </div>
    );
  }
  if (destination === 'business-movement') return <MovementResult />;
  return <TradingResult />;
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
  const id = `stage3a1-destination-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label className="block min-w-0 text-xs font-semibold text-amber-950" htmlFor={id}>
      {label}
      <select id={id} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-2 text-sm text-ink" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
