import type { ReactNode } from 'react';
import StatCard from '@/components/StatCard';
import { DEMO_BUSINESS, DEMO_KPIS } from '@/lib/marketing/demo-metrics';

export function MarketingEyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-blue-100 bg-blue-50/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
      {children}
    </span>
  );
}

export function CommandCentrePreview({ compact = false }: { compact?: boolean }) {
  const postureMetrics = [
    { label: "Today's sales", value: DEMO_KPIS.todaySales, sub: 'Gross sales today', tone: 'border-slate-200/80 bg-white/95' },
    { label: 'Gross margin', value: DEMO_KPIS.grossMargin, sub: 'After cost of goods', tone: 'border-emerald-100/70 bg-white/95' },
    { label: "Today's receipts", value: DEMO_KPIS.todayReceipts, sub: 'Completed transactions', tone: 'border-slate-200/80 bg-white/95' },
    { label: 'Outstanding debtors', value: DEMO_KPIS.outstandingDebtors, sub: 'Customer credit due', tone: 'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-amber-50/50' },
    { label: 'Open issues', value: DEMO_KPIS.openIssues, sub: 'Requiring attention', tone: 'border-red-100 bg-gradient-to-br from-red-50 via-white to-red-50/50' },
  ];

  return (
    <div
      className={`rounded-[1.6rem] border border-slate-200/80 bg-white/70 shadow-card backdrop-blur-sm ${compact ? 'p-3 sm:p-4' : 'p-4 sm:p-5'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <MarketingEyebrow>Operations today</MarketingEyebrow>
          <span className="text-sm font-display font-semibold text-ink sm:text-base">Today&apos;s focus</span>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
          {DEMO_BUSINESS.branch}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-display font-bold text-ink sm:text-xl">{DEMO_BUSINESS.name}</h3>
        <span className="text-xs text-muted">· {DEMO_BUSINESS.owner}</span>
      </div>

      {/* Never exceed 3 columns: five columns cannot hold GH₵ figures at readable sizes inside the hero column. */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {postureMetrics.map((metric) => (
          <div key={metric.label} className={`min-w-0 rounded-2xl border p-3 shadow-card sm:p-4 ${metric.tone}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted sm:text-[11px]">{metric.label}</p>
            <p className="mt-2 break-words text-xl font-display font-bold tracking-tight text-ink tabular-nums sm:text-2xl lg:text-xl xl:text-2xl">{metric.value}</p>
            <p className="mt-1 text-[11px] text-slate-500">{metric.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <StatCard label="Expected cash" value={DEMO_KPIS.expectedCash} tone="success" helper="Cash that should be in the till now" />
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-amber-500" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink">Low stock items</p>
                <span className="rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  warning
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {DEMO_KPIS.lowStock} products need reorder attention today.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
